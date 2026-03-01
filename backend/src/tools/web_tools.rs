// Jaskier Shared Pattern — Web Tools
// Agent tools for fetching web pages, extracting text, and crawling websites.
// Uses scraper crate for HTML parsing and url crate for link resolution.

use scraper::{Html, Selector};
use serde_json::{json, Value};
use std::collections::{HashSet, VecDeque};
use std::time::Duration;
use url::Url;

use crate::models::ToolDefinition;
use crate::state::AppState;

const MAX_PAGE_SIZE: usize = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT: Duration = Duration::from_secs(30);
const CRAWL_DELAY: Duration = Duration::from_millis(500);
const MAX_CRAWL_DEPTH: u32 = 3;
const MAX_CRAWL_PAGES: usize = 20;
const USER_AGENT: &str = "Jaskier-Bot/1.0 (AI Agent Tool)";

// ═══════════════════════════════════════════════════════════════════════
//  Tool definitions
// ═══════════════════════════════════════════════════════════════════════

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "fetch_webpage".to_string(),
            description: "Fetch a web page, extract readable text content (HTML stripped) \
                and index all links. Use for reading articles, documentation, blog posts, \
                or any web content. Returns page title, clean text, and optionally all \
                discovered links with anchor text.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Full URL to fetch (http or https)"
                    },
                    "extract_links": {
                        "type": "boolean",
                        "description": "Whether to extract and list all links found on the page (default: true)"
                    }
                },
                "required": ["url"]
            }),
        },
        ToolDefinition {
            name: "crawl_website".to_string(),
            description: "Crawl a website starting from a URL, following links to subpages \
                within the same domain. Extracts text from each page and builds a complete \
                link index. Use for reading documentation sites, multi-page articles, or \
                mapping website structure. Respects same-domain restriction by default. \
                Rate-limited to 1 request per 500ms.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Starting URL to crawl (http or https)"
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": "Max link depth to follow from start page (default: 1, max: 3)"
                    },
                    "max_pages": {
                        "type": "integer",
                        "description": "Max number of pages to fetch (default: 10, max: 20)"
                    },
                    "same_domain_only": {
                        "type": "boolean",
                        "description": "Only follow links on the same domain (default: true)"
                    }
                },
                "required": ["url"]
            }),
        },
    ]
}

// ═══════════════════════════════════════════════════════════════════════
//  Dispatcher
// ═══════════════════════════════════════════════════════════════════════

pub async fn execute(
    tool_name: &str,
    input: &Value,
    state: &AppState,
) -> (String, bool) {
    match tool_name {
        "fetch_webpage" => {
            let url = input.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let extract_links = input.get("extract_links").and_then(|v| v.as_bool()).unwrap_or(true);
            match tool_fetch_webpage(url, extract_links, &state.http_client).await {
                Ok(text) => (text, false),
                Err(e) => (format!("TOOL_ERROR: {}", e), true),
            }
        }
        "crawl_website" => {
            let url = input.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let max_depth = input.get("max_depth").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
            let max_pages = input.get("max_pages").and_then(|v| v.as_u64()).unwrap_or(10) as usize;
            let same_domain = input.get("same_domain_only").and_then(|v| v.as_bool()).unwrap_or(true);
            match tool_crawl_website(
                url,
                max_depth.min(MAX_CRAWL_DEPTH),
                max_pages.min(MAX_CRAWL_PAGES),
                same_domain,
                &state.http_client,
            ).await {
                Ok(text) => (text, false),
                Err(e) => (format!("TOOL_ERROR: {}", e), true),
            }
        }
        _ => (format!("Unknown web tool: {}", tool_name), true),
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════

/// Validate URL — only http/https allowed
fn validate_web_url(raw: &str) -> Result<Url, String> {
    let parsed = Url::parse(raw).map_err(|e| format!("Invalid URL '{}': {}", raw, e))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        other => Err(format!("Unsupported URL scheme '{}' — only http/https allowed", other)),
    }
}

/// Extract readable text from HTML, preserving structure
fn extract_text_from_html(html: &str) -> String {
    let doc = Html::parse_document(html);

    // Extract title
    let title = Selector::parse("title").ok()
        .and_then(|sel| doc.select(&sel).next())
        .map(|el| el.text().collect::<String>());

    // Walk body for text
    let mut raw_text = String::new();
    if let Ok(body_sel) = Selector::parse("body") {
        if let Some(body) = doc.select(&body_sel).next() {
            collect_element_text(body, &mut raw_text);
        }
    }

    // Clean up excessive whitespace
    let lines: Vec<&str> = raw_text.lines().map(|l| l.trim()).collect();
    let mut cleaned = String::new();
    let mut last_was_blank = false;
    for line in lines {
        if line.is_empty() {
            if !last_was_blank {
                cleaned.push('\n');
                last_was_blank = true;
            }
        } else {
            cleaned.push_str(line);
            cleaned.push('\n');
            last_was_blank = false;
        }
    }

    if let Some(t) = title {
        let t = t.trim();
        if !t.is_empty() {
            return format!("# {}\n\n{}", t, cleaned.trim());
        }
    }

    cleaned.trim().to_string()
}

/// Recursively collect text from an ElementRef, skipping noise tags
fn collect_element_text(element: scraper::ElementRef, output: &mut String) {
    let tag = element.value().name();

    // Skip noise elements entirely
    if matches!(tag, "script" | "style" | "nav" | "footer" | "noscript" | "svg" | "iframe") {
        return;
    }

    let is_block = matches!(
        tag,
        "p" | "div" | "section" | "article" | "main" | "blockquote"
        | "pre" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
        | "ul" | "ol" | "table" | "tr" | "br" | "hr"
    );
    let is_list_item = tag == "li";
    let is_heading = matches!(tag, "h1" | "h2" | "h3" | "h4" | "h5" | "h6");

    if is_block {
        output.push('\n');
    }
    if is_list_item {
        output.push_str("\n- ");
    }
    if is_heading {
        let level: usize = tag[1..].parse().unwrap_or(1);
        let prefix = "#".repeat(level);
        output.push_str(&format!("\n{} ", prefix));
    }

    for child in element.children() {
        match child.value() {
            scraper::node::Node::Text(text) => {
                let t = text.text.trim();
                if !t.is_empty() {
                    output.push_str(t);
                    output.push(' ');
                }
            }
            scraper::node::Node::Element(_) => {
                if let Some(child_el) = scraper::ElementRef::wrap(child) {
                    collect_element_text(child_el, output);
                }
            }
            _ => {}
        }
    }

    if is_block {
        output.push('\n');
    }
}

/// Extract all links from HTML, resolving relative URLs
fn extract_links_from_html(html: &str, base_url: &Url) -> Vec<(String, String)> {
    let doc = Html::parse_document(html);
    let mut links = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(sel) = Selector::parse("a[href]") {
        for el in doc.select(&sel) {
            if let Some(href) = el.value().attr("href") {
                let href = href.trim();
                if href.is_empty()
                    || href.starts_with('#')
                    || href.starts_with("javascript:")
                    || href.starts_with("mailto:")
                    || href.starts_with("tel:")
                {
                    continue;
                }
                let resolved = match base_url.join(href) {
                    Ok(u) => u.to_string(),
                    Err(_) => continue,
                };
                if seen.contains(&resolved) {
                    continue;
                }
                seen.insert(resolved.clone());

                let anchor: String = el.text().collect::<Vec<_>>().join(" ");
                let anchor = anchor.trim().to_string();
                links.push((resolved, anchor));
            }
        }
    }

    links
}

/// Fetch a URL and return (html_body, final_url)
async fn fetch_url(client: &reqwest::Client, url: &str) -> Result<(String, Url), String> {
    let parsed = validate_web_url(url)?;

    let resp = client
        .get(parsed.as_str())
        .header("User-Agent", USER_AGENT)
        .timeout(FETCH_TIMEOUT)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch '{}': {}", url, e))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {} for '{}'", status, url));
    }

    if let Some(len) = resp.content_length() {
        if len as usize > MAX_PAGE_SIZE {
            return Err(format!("Response too large: {} bytes (max {})", len, MAX_PAGE_SIZE));
        }
    }

    let final_url = Url::parse(resp.url().as_str()).unwrap_or(parsed);

    let bytes = resp.bytes().await
        .map_err(|e| format!("Failed to read body from '{}': {}", url, e))?;

    if bytes.len() > MAX_PAGE_SIZE {
        return Err(format!("Response too large: {} bytes (max {})", bytes.len(), MAX_PAGE_SIZE));
    }

    let body = String::from_utf8_lossy(&bytes).to_string();
    Ok((body, final_url))
}

// ═══════════════════════════════════════════════════════════════════════
//  Tool implementations
// ═══════════════════════════════════════════════════════════════════════

/// Fetch a single web page and extract text + links
async fn tool_fetch_webpage(
    url: &str,
    extract_links: bool,
    client: &reqwest::Client,
) -> Result<String, String> {
    let (html, final_url) = fetch_url(client, url).await?;

    let text = extract_text_from_html(&html);
    let mut output = format!("### Web Page: {}\n\n{}", final_url, text);

    if extract_links {
        let links = extract_links_from_html(&html, &final_url);
        if !links.is_empty() {
            output.push_str("\n\n---\n### Links Found\n\n");
            for (i, (href, anchor)) in links.iter().enumerate() {
                let label = if anchor.is_empty() { href.as_str() } else { anchor.as_str() };
                output.push_str(&format!("{}. [{}]({})\n", i + 1, label, href));
            }
            output.push_str(&format!("\nTotal: {} links", links.len()));
        }
    }

    Ok(output)
}

/// Crawl a website starting from a URL, following links to subpages
async fn tool_crawl_website(
    start_url: &str,
    max_depth: u32,
    max_pages: usize,
    same_domain_only: bool,
    client: &reqwest::Client,
) -> Result<String, String> {
    let start_parsed = validate_web_url(start_url)?;
    let start_domain = start_parsed.domain().unwrap_or("").to_string();

    let mut visited: HashSet<String> = HashSet::new();
    let mut queue: VecDeque<(String, u32)> = VecDeque::new();
    let mut results: Vec<(String, String)> = Vec::new();
    let mut all_links: Vec<(String, String, String)> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    queue.push_back((start_parsed.to_string(), 0));

    while let Some((url, depth)) = queue.pop_front() {
        if visited.contains(&url) || visited.len() >= max_pages {
            continue;
        }
        visited.insert(url.clone());

        if visited.len() > 1 {
            tokio::time::sleep(CRAWL_DELAY).await;
        }

        match fetch_url(client, &url).await {
            Ok((html, final_url)) => {
                let text = extract_text_from_html(&html);
                let excerpt: String = text.char_indices()
                    .take_while(|(i, _)| *i < 2000)
                    .map(|(_, c)| c)
                    .collect();
                results.push((final_url.to_string(), excerpt));

                let links = extract_links_from_html(&html, &final_url);
                for (href, anchor) in &links {
                    all_links.push((url.clone(), href.clone(), anchor.clone()));

                    if depth < max_depth && !visited.contains(href) {
                        if same_domain_only {
                            if let Ok(link_url) = Url::parse(href) {
                                let link_domain = link_url.domain().unwrap_or("");
                                if link_domain != start_domain {
                                    continue;
                                }
                            }
                        }
                        let path = href.to_lowercase();
                        if path.ends_with(".pdf") || path.ends_with(".zip")
                            || path.ends_with(".png") || path.ends_with(".jpg")
                            || path.ends_with(".gif") || path.ends_with(".svg")
                            || path.ends_with(".css") || path.ends_with(".js")
                            || path.ends_with(".xml") || path.ends_with(".json")
                        {
                            continue;
                        }
                        queue.push_back((href.clone(), depth + 1));
                    }
                }
            }
            Err(e) => {
                errors.push(format!("{}: {}", url, e));
            }
        }
    }

    let mut output = format!(
        "### Crawl Results: {}\nPages fetched: {} | Errors: {} | Links indexed: {}\n",
        start_url, results.len(), errors.len(), all_links.len()
    );

    output.push_str("\n---\n## Pages\n\n");
    for (i, (url, excerpt)) in results.iter().enumerate() {
        output.push_str(&format!("### {}. {}\n{}\n\n", i + 1, url, excerpt));
    }

    if !all_links.is_empty() {
        output.push_str("---\n## Link Index\n\n");
        for (source, href, anchor) in &all_links {
            let label = if anchor.is_empty() { href.as_str() } else { anchor.as_str() };
            output.push_str(&format!("- [{}]({}) ← {}\n", label, href, source));
        }
    }

    if !errors.is_empty() {
        output.push_str("\n---\n## Errors\n\n");
        for err in &errors {
            output.push_str(&format!("- {}\n", err));
        }
    }

    Ok(output)
}
