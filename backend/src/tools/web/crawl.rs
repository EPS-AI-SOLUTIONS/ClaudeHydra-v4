// Jaskier Shared Pattern — Web Tools v2 — Multi-page Crawler

use std::collections::{HashSet, VecDeque};
use std::time::{Duration, Instant};
use tokio::task::JoinSet;
use url::Url;

use super::fetch;
use super::html;
use super::types::*;

// ═══════════════════════════════════════════════════════════════════════════
//  Tool: crawl_website (#11, #12, #13, #18, #19, #20, #21, #22, #27)
// ═══════════════════════════════════════════════════════════════════════════

pub async fn tool_crawl_website(
    input: &serde_json::Value,
    client: &reqwest::Client,
) -> Result<String, String> {
    let start_url = input
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or("Missing required argument: url")?;
    let max_depth = (input.get("max_depth").and_then(|v| v.as_u64()).unwrap_or(2) as u32)
        .min(MAX_CRAWL_DEPTH);
    let max_pages = (input.get("max_pages").and_then(|v| v.as_u64()).unwrap_or(10) as usize)
        .min(MAX_CRAWL_PAGES);
    let same_domain = input.get("same_domain_only").and_then(|v| v.as_bool()).unwrap_or(true);
    let path_prefix = input.get("path_prefix").and_then(|v| v.as_str()).map(String::from);
    let exclude_patterns: Vec<String> = input
        .get("exclude_patterns")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let respect_robots = input.get("respect_robots_txt").and_then(|v| v.as_bool()).unwrap_or(true);
    let use_sitemap = input.get("use_sitemap").and_then(|v| v.as_bool()).unwrap_or(true);
    let concurrent = (input.get("concurrent_requests").and_then(|v| v.as_u64()).unwrap_or(3) as usize)
        .min(MAX_CONCURRENT)
        .max(1);
    let delay_ms = input.get("delay_ms").and_then(|v| v.as_u64()).unwrap_or(DEFAULT_CRAWL_DELAY_MS);
    let max_total_secs = (input.get("max_total_seconds").and_then(|v| v.as_u64()).unwrap_or(120))
        .min(MAX_TOTAL_CRAWL_SECS);
    let output_format = input.get("output_format").and_then(|v| v.as_str()).unwrap_or("text");
    let max_text_length = input.get("max_text_length").and_then(|v| v.as_u64()).unwrap_or(3000) as usize;
    let include_metadata = input.get("include_metadata").and_then(|v| v.as_bool()).unwrap_or(true);
    let custom_headers: Vec<(String, String)> = input
        .get("headers")
        .and_then(|v| v.as_object())
        .map(|obj| {
            obj.iter()
                .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_string()))
                .collect()
        })
        .unwrap_or_default();

    let start_parsed = fetch::validate_and_check_url(start_url)?;
    let start_domain = start_parsed.domain().unwrap_or("").to_string();
    let base_origin = format!(
        "{}://{}",
        start_parsed.scheme(),
        start_parsed.host_str().unwrap_or("")
    );

    let crawl_start = Instant::now();
    let total_timeout = Duration::from_secs(max_total_secs);
    let options = ExtractionOptions { include_images: false };

    // Fetch robots.txt (#11)
    let robots_rules = if respect_robots {
        fetch::fetch_robots_txt(client, &base_origin, &custom_headers).await
    } else {
        None
    };

    // Override delay from robots.txt crawl-delay
    let effective_delay = if let Some(ref rules) = robots_rules {
        rules
            .crawl_delay
            .map(|d| (d * 1000).max(delay_ms))
            .unwrap_or(delay_ms)
    } else {
        delay_ms
    };

    // Fetch sitemap URLs (#12)
    let sitemap_urls = if use_sitemap {
        fetch::fetch_sitemap_urls(client, &base_origin, &robots_rules, &custom_headers).await
    } else {
        Vec::new()
    };

    // Initialize crawl state
    let mut visited: HashSet<String> = HashSet::new();
    let mut pending: VecDeque<(String, u32)> = VecDeque::new();
    let mut results: Vec<PageResult> = Vec::new();
    let mut content_hashes: HashSet<String> = HashSet::new();
    let mut errors: Vec<String> = Vec::new();

    // Seed queue
    let start_normalized = fetch::normalize_url(&start_parsed);
    pending.push_back((start_normalized, 0));

    // Add sitemap URLs at depth 1 (#12)
    for sitemap_url in &sitemap_urls {
        if let Ok(parsed) = Url::parse(sitemap_url) {
            let normalized = fetch::normalize_url(&parsed);
            if same_domain && parsed.domain().unwrap_or("") != start_domain {
                continue;
            }
            if let Some(ref prefix) = path_prefix {
                if !parsed.path().starts_with(prefix.as_str()) {
                    continue;
                }
            }
            if !visited.contains(&normalized) {
                pending.push_back((normalized, 1));
            }
        }
    }

    // Helper closure for URL filtering
    let should_skip_url = |url: &str| -> bool {
        // Exclude patterns (#20)
        if exclude_patterns.iter().any(|p| url.contains(p.as_str())) {
            return true;
        }
        // Path prefix (#19)
        if let Some(ref prefix) = path_prefix {
            if let Ok(parsed) = Url::parse(url) {
                if !parsed.path().starts_with(prefix.as_str()) {
                    return true;
                }
            }
        }
        // robots.txt (#11)
        if let Some(ref rules) = robots_rules {
            if let Ok(parsed) = Url::parse(url) {
                if !fetch::is_path_allowed(parsed.path(), rules) {
                    return true;
                }
            }
        }
        false
    };

    // BFS with concurrent fetching (#21)
    while !pending.is_empty() && results.len() < max_pages {
        // Check total timeout (#27, #44)
        if crawl_start.elapsed() > total_timeout {
            errors.push("Crawl stopped: total time limit reached".to_string());
            break;
        }

        // Take a batch from pending
        let mut batch: Vec<(String, u32)> = Vec::new();
        while batch.len() < concurrent {
            match pending.pop_front() {
                Some((url, depth)) => {
                    if visited.contains(&url) || should_skip_url(&url) {
                        continue;
                    }
                    visited.insert(url.clone());
                    batch.push((url, depth));
                }
                None => break,
            }
        }

        if batch.is_empty() {
            break;
        }

        // Concurrent fetch (#21)
        let mut tasks: JoinSet<(String, u32, Result<FetchResult, String>)> = JoinSet::new();
        for (url, depth) in batch {
            let client = client.clone();
            let headers = custom_headers.clone();
            tasks.spawn(async move {
                let result = fetch::fetch_url_with_retry(&client, &url, &headers).await;
                (url, depth, result)
            });
        }

        while let Some(task_result) = tasks.join_next().await {
            let (url, depth, fetch_result) = match task_result {
                Ok(v) => v,
                Err(e) => {
                    errors.push(format!("Task join error: {}", e));
                    continue;
                }
            };

            match fetch_result {
                Ok(fr) => {
                    // Skip non-HTML content (#16)
                    if !fr.content_type.contains("text/html")
                        && !fr.content_type.contains("application/xhtml")
                    {
                        continue;
                    }

                    // Extract text
                    let text = html::extract_text_from_html(&fr.html, &fr.final_url, &options);

                    // Duplicate content detection (#18, #50)
                    let hash = fetch::content_hash(&text);
                    if content_hashes.contains(&hash) {
                        continue;
                    }
                    content_hashes.insert(hash);

                    let excerpt = fetch::truncate_text(&text, max_text_length);

                    let metadata = if include_metadata {
                        Some(html::extract_metadata(&fr.html, &fr.final_url))
                    } else {
                        None
                    };

                    // Extract and categorize links
                    let raw_links = html::extract_links_from_html(&fr.html, &fr.final_url);
                    let categorized =
                        html::categorize_links(&raw_links, &start_domain, &fr.final_url.to_string());

                    results.push(PageResult {
                        url: fr.final_url.to_string(),
                        text: excerpt,
                        metadata,
                        links: categorized.clone(),
                    });

                    // Enqueue subpages
                    if depth < max_depth && results.len() < max_pages {
                        for link in &categorized {
                            if link.link_type == LinkType::Internal
                                && !visited.contains(&link.url)
                                && fetch::is_crawlable_url(&link.url)
                            {
                                if same_domain {
                                    if let Ok(parsed) = Url::parse(&link.url) {
                                        if parsed.domain().unwrap_or("") != start_domain {
                                            continue;
                                        }
                                    }
                                }
                                pending.push_back((link.url.clone(), depth + 1));
                            }
                        }
                    }
                }
                Err(e) => {
                    errors.push(format!("{}: {}", url, e));
                }
            }
        }

        // Rate limit between batches (#22)
        if effective_delay > 0 && !pending.is_empty() {
            tokio::time::sleep(Duration::from_millis(effective_delay)).await;
        }
    }

    // Format output (#45)
    match output_format {
        "json" => Ok(super::format_crawl_json(start_url, &results, &errors)),
        _ => Ok(super::format_crawl_text(start_url, &results, &errors, &visited)),
    }
}
