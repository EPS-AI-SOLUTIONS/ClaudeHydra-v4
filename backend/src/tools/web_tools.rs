// Jaskier Shared Pattern — Web Tools v2
// Comprehensive web scraping tools with 50 improvements:
// SSRF prevention, robots.txt, sitemap, concurrent crawl, HTML tables/code/links,
// metadata extraction (OG, JSON-LD, canonical), retry with backoff, content dedup,
// URL normalization, configurable options, JSON output format.

use scraper::{Html, Selector};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashSet, VecDeque};
use std::net::IpAddr;
use std::time::{Duration, Instant};
use tokio::task::JoinSet;
use url::Url;

use crate::models::ToolDefinition;
use crate::state::AppState;

// ═══════════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════════

const MAX_PAGE_SIZE: usize = 5 * 1024 * 1024;
const FETCH_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_CRAWL_DELAY_MS: u64 = 300;
const MAX_CRAWL_DEPTH: u32 = 5;
const MAX_CRAWL_PAGES: usize = 50;
const MAX_CONCURRENT: usize = 5;
const MAX_TOTAL_CRAWL_SECS: u64 = 180;
const MAX_RETRY_ATTEMPTS: u32 = 3;
const USER_AGENT: &str = "Jaskier-Bot/1.0 (AI Agent Tool)";

/// URL tracking parameters to strip during normalization (#14)
const TRACKING_PARAMS: &[&str] = &[
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "mc_cid", "mc_eid", "ref", "_ga",
];

/// File extensions to skip when crawling (#16)
const SKIP_EXTENSIONS: &[&str] = &[
    ".pdf", ".zip", ".tar", ".gz", ".rar", ".7z",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp",
    ".css", ".js", ".woff", ".woff2", ".ttf", ".eot",
    ".xml", ".json", ".rss", ".atom",
    ".mp3", ".mp4", ".avi", ".mov", ".wmv", ".flv",
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".exe", ".dmg", ".apk", ".deb", ".rpm",
];

// ═══════════════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Clone, Debug)]
struct FetchResult {
    html: String,
    final_url: Url,
    _status: u16,
    content_type: String,
}

#[derive(Clone, Debug)]
struct PageMetadata {
    title: Option<String>,
    description: Option<String>,
    language: Option<String>,
    canonical_url: Option<String>,
    og_tags: Vec<(String, String)>,
    json_ld: Vec<Value>,
}

#[derive(Clone, Debug, PartialEq)]
enum LinkType {
    Internal,
    External,
    Resource,
}

#[derive(Clone, Debug)]
struct CategorizedLink {
    url: String,
    anchor: String,
    link_type: LinkType,
    source_url: String,
}

struct RobotsRules {
    disallowed: Vec<String>,
    allowed: Vec<String>,
    sitemaps: Vec<String>,
    crawl_delay: Option<u64>,
}

struct PageResult {
    url: String,
    text: String,
    metadata: Option<PageMetadata>,
    links: Vec<CategorizedLink>,
}

struct ExtractionOptions {
    include_images: bool,
}

// ═══════════════════════════════════════════════════════════════════════════
//  Tool definitions
// ═══════════════════════════════════════════════════════════════════════════

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "fetch_webpage".to_string(),
            description: "Fetch a web page with full content extraction. Returns clean text \
                (HTML stripped, tables as markdown, code blocks preserved), page metadata \
                (title, description, language, OpenGraph, JSON-LD, canonical URL), and \
                categorized links (internal/external/resource). Supports custom headers, \
                retry with backoff, and SSRF protection. Use for reading articles, docs, \
                blog posts, or any web content.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Full URL to fetch (http or https)"
                    },
                    "extract_links": {
                        "type": "boolean",
                        "description": "Extract and categorize all links (default: true)"
                    },
                    "extract_metadata": {
                        "type": "boolean",
                        "description": "Extract OG tags, JSON-LD, canonical URL, language (default: true)"
                    },
                    "include_images": {
                        "type": "boolean",
                        "description": "Include image alt-text descriptions in output (default: false)"
                    },
                    "output_format": {
                        "type": "string",
                        "enum": ["text", "json"],
                        "description": "Output format: 'text' (markdown-like) or 'json' (structured). Default: text"
                    },
                    "max_text_length": {
                        "type": "integer",
                        "description": "Truncate extracted text to N characters (summary mode)"
                    },
                    "headers": {
                        "type": "object",
                        "description": "Custom HTTP headers to send (e.g. {\"Authorization\": \"Bearer ...\"})"
                    }
                },
                "required": ["url"]
            }),
        },
        ToolDefinition {
            name: "crawl_website".to_string(),
            description: "Crawl a website with concurrent fetching, robots.txt compliance, \
                sitemap discovery, and intelligent link following. Extracts text and metadata \
                from each page, detects duplicate content via hashing, categorizes all links. \
                Supports path prefix filtering, exclude patterns, configurable concurrency, \
                rate limiting, and total time limit. Returns aggregated content with link index. \
                Use for reading documentation sites, multi-page articles, or mapping website \
                structure.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Starting URL to crawl (http or https)"
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": "Max link depth to follow (default: 2, max: 5)"
                    },
                    "max_pages": {
                        "type": "integer",
                        "description": "Max pages to fetch (default: 10, max: 50)"
                    },
                    "same_domain_only": {
                        "type": "boolean",
                        "description": "Only follow links on same domain (default: true)"
                    },
                    "path_prefix": {
                        "type": "string",
                        "description": "Only follow URLs whose path starts with this prefix (e.g. '/docs/')"
                    },
                    "exclude_patterns": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Skip URLs containing any of these substrings (e.g. ['/api/', '/admin/'])"
                    },
                    "respect_robots_txt": {
                        "type": "boolean",
                        "description": "Fetch and respect robots.txt rules (default: true)"
                    },
                    "use_sitemap": {
                        "type": "boolean",
                        "description": "Discover pages from sitemap.xml (default: true)"
                    },
                    "concurrent_requests": {
                        "type": "integer",
                        "description": "Number of concurrent requests (default: 3, max: 5)"
                    },
                    "delay_ms": {
                        "type": "integer",
                        "description": "Delay between request batches in ms (default: 300)"
                    },
                    "max_total_seconds": {
                        "type": "integer",
                        "description": "Total crawl time limit in seconds (default: 120, max: 180)"
                    },
                    "output_format": {
                        "type": "string",
                        "enum": ["text", "json"],
                        "description": "Output format: 'text' or 'json'. Default: text"
                    },
                    "max_text_length": {
                        "type": "integer",
                        "description": "Max text chars per page (default: 3000)"
                    },
                    "include_metadata": {
                        "type": "boolean",
                        "description": "Include page metadata in output (default: true)"
                    },
                    "headers": {
                        "type": "object",
                        "description": "Custom HTTP headers for all requests"
                    }
                },
                "required": ["url"]
            }),
        },
    ]
}

// ═══════════════════════════════════════════════════════════════════════════
//  Dispatcher
// ═══════════════════════════════════════════════════════════════════════════

pub async fn execute(tool_name: &str, input: &Value, state: &AppState) -> (String, bool) {
    match tool_name {
        "fetch_webpage" => match tool_fetch_webpage(input, &state.http_client).await {
            Ok(text) => (text, false),
            Err(e) => (format!("TOOL_ERROR: {}", e), true),
        },
        "crawl_website" => match tool_crawl_website(input, &state.http_client).await {
            Ok(text) => (text, false),
            Err(e) => (format!("TOOL_ERROR: {}", e), true),
        },
        _ => (format!("Unknown web tool: {}", tool_name), true),
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  URL Validation, Normalization & SSRF Prevention (#14, #33, #35)
// ═══════════════════════════════════════════════════════════════════════════

/// Validate URL, check SSRF, normalize
fn validate_and_check_url(raw: &str) -> Result<Url, String> {
    let parsed = Url::parse(raw).map_err(|e| format!("Invalid URL '{}': {}", raw, e))?;
    match parsed.scheme() {
        "http" | "https" => {}
        other => return Err(format!("Unsupported scheme '{}' — only http/https", other)),
    }
    if is_ssrf_target(&parsed) {
        return Err(format!("Blocked: URL '{}' targets a private/internal address", raw));
    }
    Ok(parsed)
}

/// Normalize URL: strip tracking params, trailing slash, lowercase scheme+host (#14)
fn normalize_url(url: &Url) -> String {
    let mut normalized = url.clone();

    // Remove tracking parameters
    if normalized.query().is_some() {
        let pairs: Vec<(String, String)> = normalized
            .query_pairs()
            .filter(|(k, _)| !TRACKING_PARAMS.contains(&k.as_ref()))
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        if pairs.is_empty() {
            normalized.set_query(None);
        } else {
            let mut sorted = pairs;
            sorted.sort_by(|a, b| a.0.cmp(&b.0));
            let qs: Vec<String> = sorted.iter().map(|(k, v)| {
                if v.is_empty() { k.clone() } else { format!("{}={}", k, v) }
            }).collect();
            normalized.set_query(Some(&qs.join("&")));
        }
    }

    // Remove fragment
    normalized.set_fragment(None);

    let mut s = normalized.to_string();

    // Strip trailing slash (but keep root "/")
    if s.ends_with('/') && s.matches('/').count() > 3 {
        s.pop();
    }

    s
}

/// Check if URL targets a private/internal IP (SSRF prevention) (#33)
fn is_ssrf_target(url: &Url) -> bool {
    let host = match url.host_str() {
        Some(h) => h,
        None => return true,
    };

    // Check IP addresses
    if let Ok(ip) = host.parse::<IpAddr>() {
        return match ip {
            IpAddr::V4(v4) => {
                v4.is_loopback()
                    || v4.is_private()
                    || v4.is_link_local()
                    || v4.is_broadcast()
                    || v4.is_unspecified()
                    || v4.octets()[0] == 100 && v4.octets()[1] >= 64 && v4.octets()[1] <= 127
            }
            IpAddr::V6(v6) => {
                v6.is_loopback()
                    || v6.is_unspecified()
                    || {
                        let seg = v6.segments();
                        (seg[0] & 0xfe00) == 0xfc00 || (seg[0] & 0xffc0) == 0xfe80
                    }
            }
        };
    }

    // Check hostnames
    let h = host.to_lowercase();
    h == "localhost"
        || h.ends_with(".local")
        || h.ends_with(".internal")
        || h.ends_with(".localhost")
        || h == "metadata.google.internal"
        || h.contains("169.254.169.254")
}

/// Check if URL is suitable for crawling (not a binary/resource file) (#16)
fn is_crawlable_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    // Strip query string for extension check
    let path = lower.split('?').next().unwrap_or(&lower);
    !SKIP_EXTENSIONS.iter().any(|ext| path.ends_with(ext))
}

// ═══════════════════════════════════════════════════════════════════════════
//  robots.txt (#11)
// ═══════════════════════════════════════════════════════════════════════════

async fn fetch_robots_txt(
    client: &reqwest::Client,
    base_origin: &str,
    custom_headers: &[(String, String)],
) -> Option<RobotsRules> {
    let robots_url = format!("{}/robots.txt", base_origin);
    let mut req = client
        .get(&robots_url)
        .header("User-Agent", USER_AGENT)
        .timeout(Duration::from_secs(10));
    for (k, v) in custom_headers {
        req = req.header(k.as_str(), v.as_str());
    }
    let resp = req.send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let text = resp.text().await.ok()?;
    Some(parse_robots_txt(&text))
}

fn parse_robots_txt(text: &str) -> RobotsRules {
    let mut rules = RobotsRules {
        disallowed: Vec::new(),
        allowed: Vec::new(),
        sitemaps: Vec::new(),
        crawl_delay: None,
    };
    let mut in_section = false;

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line_lower = line.to_lowercase();

        if line_lower.starts_with("user-agent:") {
            let agent = line[11..].trim();
            in_section = agent == "*"
                || agent.to_lowercase().contains("jaskier")
                || agent.to_lowercase().contains("bot");
        } else if line_lower.starts_with("disallow:") && in_section {
            let path = line[9..].trim();
            if !path.is_empty() {
                rules.disallowed.push(path.to_string());
            }
        } else if line_lower.starts_with("allow:") && in_section {
            let path = line[6..].trim();
            if !path.is_empty() {
                rules.allowed.push(path.to_string());
            }
        } else if line_lower.starts_with("crawl-delay:") && in_section {
            if let Ok(d) = line[12..].trim().parse::<u64>() {
                rules.crawl_delay = Some(d);
            }
        } else if line_lower.starts_with("sitemap:") {
            let url = line[8..].trim();
            if !url.is_empty() {
                rules.sitemaps.push(url.to_string());
            }
        }
    }
    rules
}

fn is_path_allowed(path: &str, rules: &RobotsRules) -> bool {
    // More specific rules win (longer path match)
    let mut allowed_match_len = 0usize;
    let mut disallowed_match_len = 0usize;

    for a in &rules.allowed {
        if path.starts_with(a) && a.len() > allowed_match_len {
            allowed_match_len = a.len();
        }
    }
    for d in &rules.disallowed {
        if path.starts_with(d) && d.len() > disallowed_match_len {
            disallowed_match_len = d.len();
        }
    }

    if disallowed_match_len == 0 {
        return true;
    }
    allowed_match_len >= disallowed_match_len
}

// ═══════════════════════════════════════════════════════════════════════════
//  Sitemap (#12)
// ═══════════════════════════════════════════════════════════════════════════

async fn fetch_sitemap_urls(
    client: &reqwest::Client,
    base_origin: &str,
    robots_rules: &Option<RobotsRules>,
    custom_headers: &[(String, String)],
) -> Vec<String> {
    let mut sitemap_locations = Vec::new();

    // From robots.txt
    if let Some(rules) = robots_rules {
        sitemap_locations.extend(rules.sitemaps.clone());
    }

    // Default location
    if sitemap_locations.is_empty() {
        sitemap_locations.push(format!("{}/sitemap.xml", base_origin));
    }

    let mut all_urls = Vec::new();

    for loc in sitemap_locations.iter().take(3) {
        let mut req = client
            .get(loc)
            .header("User-Agent", USER_AGENT)
            .timeout(Duration::from_secs(10));
        for (k, v) in custom_headers {
            req = req.header(k.as_str(), v.as_str());
        }
        if let Ok(resp) = req.send().await {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    let urls = parse_sitemap_xml(&text);
                    // Check if it's a sitemap index (URLs end in .xml)
                    let is_index = urls.iter().any(|u| u.ends_with(".xml"));
                    if is_index {
                        // Fetch first sub-sitemap only
                        if let Some(sub_url) = urls.first() {
                            let mut sub_req = client
                                .get(sub_url)
                                .header("User-Agent", USER_AGENT)
                                .timeout(Duration::from_secs(10));
                            for (k, v) in custom_headers {
                                sub_req = sub_req.header(k.as_str(), v.as_str());
                            }
                            if let Ok(sub_resp) = sub_req.send().await {
                                if sub_resp.status().is_success() {
                                    if let Ok(sub_text) = sub_resp.text().await {
                                        all_urls.extend(parse_sitemap_xml(&sub_text));
                                    }
                                }
                            }
                        }
                    } else {
                        all_urls.extend(urls);
                    }
                }
            }
        }
    }

    all_urls
}

/// Extract <loc> URLs from sitemap XML (simple string parsing, no XML dep)
fn parse_sitemap_xml(xml: &str) -> Vec<String> {
    let mut urls = Vec::new();
    let mut pos = 0;
    while let Some(start) = xml[pos..].find("<loc>") {
        let start = pos + start + 5;
        if let Some(end) = xml[start..].find("</loc>") {
            let url = xml[start..start + end].trim();
            if !url.is_empty() {
                urls.push(url.to_string());
            }
            pos = start + end + 6;
        } else {
            break;
        }
    }
    urls
}

// ═══════════════════════════════════════════════════════════════════════════
//  HTTP Fetch with Retry (#25, #26, #35, #36, #39, #40, #44)
// ═══════════════════════════════════════════════════════════════════════════

async fn fetch_url_with_retry(
    client: &reqwest::Client,
    url: &str,
    custom_headers: &[(String, String)],
) -> Result<FetchResult, String> {
    let parsed = validate_and_check_url(url)?;

    for attempt in 0..=MAX_RETRY_ATTEMPTS {
        let mut req = client
            .get(parsed.as_str())
            .header("User-Agent", USER_AGENT)
            .header("Accept", "text/html,application/xhtml+xml,*/*;q=0.8")
            .header("Accept-Language", "en-US,en;q=0.9,pl;q=0.8")
            .timeout(FETCH_TIMEOUT);

        for (k, v) in custom_headers {
            req = req.header(k.as_str(), v.as_str());
        }

        match req.send().await {
            Ok(resp) => {
                let status = resp.status();

                // Retry on server errors and 429 (#39)
                if (status.is_server_error() || status.as_u16() == 429) && attempt < MAX_RETRY_ATTEMPTS {
                    let delay = if status.as_u16() == 429 {
                        resp.headers()
                            .get("retry-after")
                            .and_then(|v| v.to_str().ok())
                            .and_then(|s| s.parse::<u64>().ok())
                            .unwrap_or(2u64.pow(attempt))
                    } else {
                        2u64.pow(attempt)
                    };
                    tokio::time::sleep(Duration::from_secs(delay.min(10))).await;
                    continue;
                }

                if !status.is_success() {
                    return Err(format!("HTTP {} for '{}'", status, url));
                }

                // Content-Type check (#16)
                let content_type = resp
                    .headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("text/html")
                    .to_string();

                // Content-Length pre-check (#36)
                if let Some(len) = resp.content_length() {
                    if len as usize > MAX_PAGE_SIZE {
                        return Err(format!("Response too large: {} bytes (max {})", len, MAX_PAGE_SIZE));
                    }
                }

                let final_url = Url::parse(resp.url().as_str()).unwrap_or(parsed.clone());

                let bytes = resp
                    .bytes()
                    .await
                    .map_err(|e| format!("Failed to read body from '{}': {}", url, e))?;

                if bytes.len() > MAX_PAGE_SIZE {
                    return Err(format!("Response too large: {} bytes (max {})", bytes.len(), MAX_PAGE_SIZE));
                }

                let html = String::from_utf8_lossy(&bytes).to_string();

                return Ok(FetchResult {
                    html,
                    final_url,
                    _status: status.as_u16(),
                    content_type,
                });
            }
            Err(e) => {
                // Retry on transient errors (#39)
                if attempt < MAX_RETRY_ATTEMPTS && (e.is_timeout() || e.is_connect()) {
                    tokio::time::sleep(Duration::from_secs(2u64.pow(attempt))).await;
                    continue;
                }
                return Err(format!("Failed to fetch '{}': {}", url, e));
            }
        }
    }

    Err(format!("Failed to fetch '{}' after {} retries", url, MAX_RETRY_ATTEMPTS))
}

// ═══════════════════════════════════════════════════════════════════════════
//  HTML Text Extraction (#1-#3, #6, #7, #9, #10)
// ═══════════════════════════════════════════════════════════════════════════

/// Extract readable text from HTML with enhanced formatting
fn extract_text_from_html(html: &str, base_url: &Url, options: &ExtractionOptions) -> String {
    let doc = Html::parse_document(html);

    // Extract title
    let title = Selector::parse("title")
        .ok()
        .and_then(|sel| doc.select(&sel).next())
        .map(|el| el.text().collect::<String>());

    // Prefer article > main > body for main content (#1 simplified readability)
    let mut raw_text = String::new();
    let content_found = if let Ok(sel) = Selector::parse("article") {
        if let Some(el) = doc.select(&sel).next() {
            collect_element_text(el, &mut raw_text, base_url, options);
            true
        } else {
            false
        }
    } else {
        false
    };

    if !content_found {
        if let Ok(sel) = Selector::parse("main") {
            if let Some(el) = doc.select(&sel).next() {
                collect_element_text(el, &mut raw_text, base_url, options);
            } else if let Ok(body_sel) = Selector::parse("body") {
                if let Some(body) = doc.select(&body_sel).next() {
                    collect_element_text(body, &mut raw_text, base_url, options);
                }
            }
        } else if let Ok(body_sel) = Selector::parse("body") {
            if let Some(body) = doc.select(&body_sel).next() {
                collect_element_text(body, &mut raw_text, base_url, options);
            }
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

/// Recursively collect text from an ElementRef with enhanced formatting
fn collect_element_text(
    element: scraper::ElementRef,
    output: &mut String,
    base_url: &Url,
    options: &ExtractionOptions,
) {
    let tag = element.value().name();

    // Skip noise elements
    if matches!(tag, "script" | "style" | "noscript" | "svg" | "iframe") {
        return;
    }

    // Skip nav/footer/aside/header for cleaner output
    if matches!(tag, "nav" | "footer" | "aside") {
        return;
    }

    // Special element handling
    match tag {
        // Tables → markdown (#2)
        "table" => {
            extract_table_as_markdown(element, output);
            return;
        }
        // Code blocks → fenced markdown (#3)
        "pre" => {
            extract_code_block(element, output);
            return;
        }
        // Inline links → [text](url) (#7)
        "a" => {
            if let Some(href) = element.value().attr("href") {
                let href = href.trim();
                if !href.is_empty()
                    && !href.starts_with('#')
                    && !href.starts_with("javascript:")
                {
                    if let Ok(resolved) = base_url.join(href) {
                        let text: String = element.text().collect::<Vec<_>>().join(" ");
                        let text = text.trim();
                        if !text.is_empty() {
                            output.push_str(&format!("[{}]({})", text, resolved));
                            output.push(' ');
                            return;
                        }
                    }
                }
            }
            // Fallthrough: collect text normally
        }
        // Images → alt text (#6)
        "img" => {
            if options.include_images {
                if let Some(alt) = element.value().attr("alt") {
                    let alt = alt.trim();
                    if !alt.is_empty() {
                        output.push_str(&format!("[Image: {}] ", alt));
                    }
                }
            }
            return;
        }
        // Definition lists (#9)
        "dl" => {
            extract_definition_list(element, output);
            return;
        }
        // Details/summary → expand (#10)
        "summary" => {
            let text: String = element.text().collect::<String>();
            let text = text.trim();
            if !text.is_empty() {
                output.push_str(&format!("\n**{}**\n", text));
            }
            return;
        }
        _ => {}
    }

    // Block elements
    let is_block = matches!(
        tag,
        "p" | "div" | "section" | "article" | "main" | "blockquote"
            | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
            | "ul" | "ol" | "br" | "hr" | "details" | "figure"
            | "figcaption" | "header"
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
        output.push_str(&format!("\n{} ", "#".repeat(level)));
    }
    if tag == "blockquote" {
        output.push_str("> ");
    }
    if tag == "hr" {
        output.push_str("\n---\n");
        return;
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
                    collect_element_text(child_el, output, base_url, options);
                }
            }
            _ => {}
        }
    }

    if is_block {
        output.push('\n');
    }
}

/// Convert HTML table to markdown table (#2)
fn extract_table_as_markdown(table: scraper::ElementRef, output: &mut String) {
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut has_header = false;

    if let Ok(tr_sel) = Selector::parse("tr") {
        for tr in table.select(&tr_sel) {
            let mut cells = Vec::new();
            let mut is_header_row = false;

            for child in tr.children() {
                if let Some(el) = scraper::ElementRef::wrap(child) {
                    let t = el.value().name();
                    if t == "th" || t == "td" {
                        if t == "th" {
                            is_header_row = true;
                        }
                        let text: String = el.text().collect::<String>();
                        cells.push(text.trim().replace('|', "\\|").to_string());
                    }
                }
            }

            if !cells.is_empty() {
                if is_header_row && rows.is_empty() {
                    has_header = true;
                }
                rows.push(cells);
            }
        }
    }

    if rows.is_empty() {
        return;
    }

    let max_cols = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    if max_cols == 0 {
        return;
    }

    output.push('\n');
    for (i, row) in rows.iter().enumerate() {
        output.push('|');
        for j in 0..max_cols {
            let cell = row.get(j).map(|s| s.as_str()).unwrap_or("");
            output.push_str(&format!(" {} |", cell));
        }
        output.push('\n');

        // Separator after first row
        if i == 0 && (has_header || rows.len() > 1) {
            output.push('|');
            for _ in 0..max_cols {
                output.push_str(" --- |");
            }
            output.push('\n');
        }
    }
    output.push('\n');
}

/// Extract code block from <pre> element (#3)
fn extract_code_block(pre: scraper::ElementRef, output: &mut String) {
    let mut language = String::new();
    let mut code_text = String::new();

    for child in pre.children() {
        if let Some(el) = scraper::ElementRef::wrap(child) {
            if el.value().name() == "code" {
                if let Some(classes) = el.value().attr("class") {
                    for class in classes.split_whitespace() {
                        if let Some(lang) = class
                            .strip_prefix("language-")
                            .or_else(|| class.strip_prefix("lang-"))
                            .or_else(|| class.strip_prefix("highlight-"))
                        {
                            language = lang.to_string();
                            break;
                        }
                    }
                }
                code_text = el.text().collect::<String>();
            }
        }
    }

    if code_text.is_empty() {
        code_text = pre.text().collect::<String>();
    }

    let code_text = code_text.trim();
    if code_text.is_empty() {
        return;
    }

    output.push_str(&format!("\n```{}\n{}\n```\n", language, code_text));
}

/// Extract definition list <dl> (#9)
fn extract_definition_list(dl: scraper::ElementRef, output: &mut String) {
    output.push('\n');
    for child in dl.children() {
        if let Some(el) = scraper::ElementRef::wrap(child) {
            match el.value().name() {
                "dt" => {
                    let text: String = el.text().collect::<String>();
                    output.push_str(&format!("\n**{}**", text.trim()));
                }
                "dd" => {
                    let text: String = el.text().collect::<String>();
                    output.push_str(&format!(": {}\n", text.trim()));
                }
                _ => {}
            }
        }
    }
    output.push('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
//  Metadata Extraction (#4, #5, #8, #15)
// ═══════════════════════════════════════════════════════════════════════════

fn extract_metadata(html: &str, final_url: &Url) -> PageMetadata {
    let doc = Html::parse_document(html);

    // Title
    let title = Selector::parse("title")
        .ok()
        .and_then(|sel| doc.select(&sel).next())
        .map(|el| el.text().collect::<String>().trim().to_string());

    // Description (meta name="description")
    let description = Selector::parse("meta[name='description']")
        .ok()
        .and_then(|sel| doc.select(&sel).next())
        .and_then(|el| el.value().attr("content"))
        .map(|s| s.trim().to_string());

    // Language (#8)
    let language = Selector::parse("html")
        .ok()
        .and_then(|sel| doc.select(&sel).next())
        .and_then(|el| el.value().attr("lang"))
        .map(|s| s.trim().to_string());

    // Canonical URL (#15)
    let canonical_url = Selector::parse("link[rel='canonical']")
        .ok()
        .and_then(|sel| doc.select(&sel).next())
        .and_then(|el| el.value().attr("href"))
        .map(|href| {
            final_url
                .join(href)
                .map(|u| u.to_string())
                .unwrap_or_else(|_| href.to_string())
        });

    // OpenGraph tags (#5)
    let mut og_tags = Vec::new();
    if let Ok(sel) = Selector::parse("meta[property]") {
        for el in doc.select(&sel) {
            if let (Some(prop), Some(content)) =
                (el.value().attr("property"), el.value().attr("content"))
            {
                if prop.starts_with("og:") || prop.starts_with("article:") {
                    og_tags.push((prop.to_string(), content.to_string()));
                }
            }
        }
    }

    // JSON-LD (#4)
    let mut json_ld = Vec::new();
    if let Ok(sel) = Selector::parse("script[type='application/ld+json']") {
        for el in doc.select(&sel) {
            let text: String = el.text().collect();
            if let Ok(val) = serde_json::from_str::<Value>(&text) {
                json_ld.push(val);
            }
        }
    }

    PageMetadata {
        title,
        description,
        language,
        canonical_url,
        og_tags,
        json_ld,
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Link Extraction & Categorization (#48)
// ═══════════════════════════════════════════════════════════════════════════

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
                    || href.starts_with("data:")
                {
                    continue;
                }
                let resolved = match base_url.join(href) {
                    Ok(u) => normalize_url(&u),
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

/// Categorize links into internal, external, resource (#48)
fn categorize_links(
    links: &[(String, String)],
    start_domain: &str,
    source_url: &str,
) -> Vec<CategorizedLink> {
    links
        .iter()
        .map(|(url, anchor)| {
            let link_type = if !is_crawlable_url(url) {
                LinkType::Resource
            } else if let Ok(parsed) = Url::parse(url) {
                if parsed.domain().unwrap_or("") == start_domain {
                    LinkType::Internal
                } else {
                    LinkType::External
                }
            } else {
                LinkType::External
            };

            CategorizedLink {
                url: url.clone(),
                anchor: anchor.clone(),
                link_type,
                source_url: source_url.to_string(),
            }
        })
        .collect()
}

// ═══════════════════════════════════════════════════════════════════════════
//  Utility (#18, #47, #50)
// ═══════════════════════════════════════════════════════════════════════════

/// SHA-256 hash of content for duplicate detection (#18, #50)
fn content_hash(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Safe UTF-8 text truncation (#47)
fn truncate_text(text: &str, max_len: usize) -> String {
    if text.len() <= max_len {
        return text.to_string();
    }
    text.char_indices()
        .take_while(|(i, _)| *i < max_len)
        .map(|(_, c)| c)
        .collect::<String>()
        + "…"
}

// ═══════════════════════════════════════════════════════════════════════════
//  Output Formatting (#45, #46)
// ═══════════════════════════════════════════════════════════════════════════

fn format_fetch_text(
    url: &Url,
    text: &str,
    metadata: Option<&PageMetadata>,
    links: Option<&[CategorizedLink]>,
) -> String {
    let mut out = format!("### Web Page: {}\n\n{}", url, text);

    if let Some(meta) = metadata {
        out.push_str("\n\n---\n### Metadata\n");
        if let Some(desc) = &meta.description {
            out.push_str(&format!("- **Description**: {}\n", desc));
        }
        if let Some(lang) = &meta.language {
            out.push_str(&format!("- **Language**: {}\n", lang));
        }
        if let Some(canonical) = &meta.canonical_url {
            out.push_str(&format!("- **Canonical URL**: {}\n", canonical));
        }
        for (prop, val) in &meta.og_tags {
            out.push_str(&format!("- **{}**: {}\n", prop, val));
        }
        if !meta.json_ld.is_empty() {
            out.push_str(&format!("- **JSON-LD**: {} structured data blocks\n", meta.json_ld.len()));
        }
    }

    if let Some(links) = links {
        let internal: Vec<_> = links.iter().filter(|l| l.link_type == LinkType::Internal).collect();
        let external: Vec<_> = links.iter().filter(|l| l.link_type == LinkType::External).collect();
        let resources: Vec<_> = links.iter().filter(|l| l.link_type == LinkType::Resource).collect();

        if !links.is_empty() {
            out.push_str("\n---\n### Links Found\n");
            out.push_str(&format!(
                "Internal: {} | External: {} | Resources: {}\n\n",
                internal.len(), external.len(), resources.len()
            ));

            if !internal.is_empty() {
                out.push_str("**Internal:**\n");
                for (i, l) in internal.iter().enumerate() {
                    let label = if l.anchor.is_empty() { &l.url } else { &l.anchor };
                    out.push_str(&format!("{}. [{}]({})\n", i + 1, label, l.url));
                }
            }
            if !external.is_empty() {
                out.push_str("\n**External:**\n");
                for (i, l) in external.iter().enumerate() {
                    let label = if l.anchor.is_empty() { &l.url } else { &l.anchor };
                    out.push_str(&format!("{}. [{}]({})\n", i + 1, label, l.url));
                }
            }
            if !resources.is_empty() {
                out.push_str("\n**Resources:**\n");
                for (i, l) in resources.iter().enumerate() {
                    let label = if l.anchor.is_empty() { &l.url } else { &l.anchor };
                    out.push_str(&format!("{}. [{}]({})\n", i + 1, label, l.url));
                }
            }
        }
    }

    out
}

fn format_fetch_json(
    url: &Url,
    text: &str,
    metadata: Option<&PageMetadata>,
    links: Option<&[CategorizedLink]>,
) -> String {
    let mut obj = json!({
        "url": url.to_string(),
        "text": text,
    });

    if let Some(meta) = metadata {
        obj["metadata"] = json!({
            "title": meta.title,
            "description": meta.description,
            "language": meta.language,
            "canonical_url": meta.canonical_url,
            "og_tags": meta.og_tags.iter().map(|(k, v)| json!({k: v})).collect::<Vec<_>>(),
            "json_ld": meta.json_ld,
        });
    }

    if let Some(links) = links {
        let internal: Vec<_> = links
            .iter()
            .filter(|l| l.link_type == LinkType::Internal)
            .map(|l| json!({"url": l.url, "anchor": l.anchor}))
            .collect();
        let external: Vec<_> = links
            .iter()
            .filter(|l| l.link_type == LinkType::External)
            .map(|l| json!({"url": l.url, "anchor": l.anchor}))
            .collect();
        let resources: Vec<_> = links
            .iter()
            .filter(|l| l.link_type == LinkType::Resource)
            .map(|l| json!({"url": l.url, "anchor": l.anchor}))
            .collect();

        obj["links"] = json!({
            "internal": internal,
            "external": external,
            "resources": resources,
            "total": links.len(),
        });
    }

    serde_json::to_string_pretty(&obj).unwrap_or_else(|_| obj.to_string())
}

fn format_crawl_text(
    start_url: &str,
    results: &[PageResult],
    errors: &[String],
    visited_urls: &HashSet<String>,
) -> String {
    let link_count: usize = results.iter().map(|r| r.links.len()).sum();
    let mut out = format!(
        "### Crawl Results: {}\nPages: {} | Errors: {} | Links: {} | URLs visited: {}\n",
        start_url,
        results.len(),
        errors.len(),
        link_count,
        visited_urls.len(),
    );

    out.push_str("\n---\n## Pages\n\n");
    for (i, page) in results.iter().enumerate() {
        out.push_str(&format!("### {}. {}\n", i + 1, page.url));
        if let Some(meta) = &page.metadata {
            if let Some(desc) = &meta.description {
                out.push_str(&format!("> {}\n", desc));
            }
            if let Some(lang) = &meta.language {
                out.push_str(&format!("Language: {} | ", lang));
            }
            out.push_str(&format!(
                "Links: {} internal, {} external\n",
                page.links.iter().filter(|l| l.link_type == LinkType::Internal).count(),
                page.links.iter().filter(|l| l.link_type == LinkType::External).count(),
            ));
        }
        out.push_str(&format!("{}\n\n", page.text));
    }

    // Aggregated link index
    let all_internal: Vec<&CategorizedLink> = results
        .iter()
        .flat_map(|r| r.links.iter())
        .filter(|l| l.link_type == LinkType::Internal)
        .collect();
    let all_external: Vec<&CategorizedLink> = results
        .iter()
        .flat_map(|r| r.links.iter())
        .filter(|l| l.link_type == LinkType::External)
        .collect();

    if !all_internal.is_empty() || !all_external.is_empty() {
        out.push_str("---\n## Link Index\n\n");
        if !all_internal.is_empty() {
            out.push_str(&format!("**Internal ({}):**\n", all_internal.len()));
            let mut seen = HashSet::new();
            for l in &all_internal {
                if seen.insert(&l.url) {
                    let label = if l.anchor.is_empty() { &l.url } else { &l.anchor };
                    out.push_str(&format!("- [{}]({}) ← {}\n", label, l.url, l.source_url));
                }
            }
        }
        if !all_external.is_empty() {
            out.push_str(&format!("\n**External ({}):**\n", all_external.len()));
            let mut seen = HashSet::new();
            for l in &all_external {
                if seen.insert(&l.url) {
                    let label = if l.anchor.is_empty() { &l.url } else { &l.anchor };
                    out.push_str(&format!("- [{}]({})\n", label, l.url));
                }
            }
        }
    }

    if !errors.is_empty() {
        out.push_str("\n---\n## Errors\n\n");
        for err in errors {
            out.push_str(&format!("- {}\n", err));
        }
    }

    out
}

fn format_crawl_json(
    start_url: &str,
    results: &[PageResult],
    errors: &[String],
) -> String {
    let pages: Vec<Value> = results
        .iter()
        .map(|page| {
            let mut p = json!({
                "url": page.url,
                "text": page.text,
            });
            if let Some(meta) = &page.metadata {
                p["metadata"] = json!({
                    "title": meta.title,
                    "description": meta.description,
                    "language": meta.language,
                    "canonical_url": meta.canonical_url,
                });
            }
            p["links"] = json!({
                "internal": page.links.iter()
                    .filter(|l| l.link_type == LinkType::Internal)
                    .map(|l| json!({"url": l.url, "anchor": l.anchor}))
                    .collect::<Vec<_>>(),
                "external": page.links.iter()
                    .filter(|l| l.link_type == LinkType::External)
                    .map(|l| json!({"url": l.url, "anchor": l.anchor}))
                    .collect::<Vec<_>>(),
            });
            p
        })
        .collect();

    let obj = json!({
        "start_url": start_url,
        "pages_fetched": results.len(),
        "errors_count": errors.len(),
        "pages": pages,
        "errors": errors,
    });

    serde_json::to_string_pretty(&obj).unwrap_or_else(|_| obj.to_string())
}

// ═══════════════════════════════════════════════════════════════════════════
//  Tool: fetch_webpage
// ═══════════════════════════════════════════════════════════════════════════

async fn tool_fetch_webpage(
    input: &Value,
    client: &reqwest::Client,
) -> Result<String, String> {
    let url = input
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or("Missing required argument: url")?;
    let extract_links = input.get("extract_links").and_then(|v| v.as_bool()).unwrap_or(true);
    let extract_meta = input.get("extract_metadata").and_then(|v| v.as_bool()).unwrap_or(true);
    let include_images = input.get("include_images").and_then(|v| v.as_bool()).unwrap_or(false);
    let output_format = input.get("output_format").and_then(|v| v.as_str()).unwrap_or("text");
    let max_text_length = input.get("max_text_length").and_then(|v| v.as_u64()).map(|n| n as usize);
    let custom_headers: Vec<(String, String)> = input
        .get("headers")
        .and_then(|v| v.as_object())
        .map(|obj| {
            obj.iter()
                .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_string()))
                .collect()
        })
        .unwrap_or_default();

    let options = ExtractionOptions { include_images };

    let fetch_result = fetch_url_with_retry(client, url, &custom_headers).await?;

    // Check content type (#16)
    if !fetch_result.content_type.contains("text/html")
        && !fetch_result.content_type.contains("application/xhtml")
        && !fetch_result.content_type.contains("text/plain")
    {
        return Err(format!(
            "Not an HTML page: Content-Type is '{}'",
            fetch_result.content_type
        ));
    }

    let text = extract_text_from_html(&fetch_result.html, &fetch_result.final_url, &options);
    let text = if let Some(max_len) = max_text_length {
        truncate_text(&text, max_len)
    } else {
        text
    };

    let metadata = if extract_meta {
        Some(extract_metadata(&fetch_result.html, &fetch_result.final_url))
    } else {
        None
    };

    let links = if extract_links {
        let raw_links = extract_links_from_html(&fetch_result.html, &fetch_result.final_url);
        let domain = fetch_result.final_url.domain().unwrap_or("");
        Some(categorize_links(&raw_links, domain, &fetch_result.final_url.to_string()))
    } else {
        None
    };

    match output_format {
        "json" => Ok(format_fetch_json(
            &fetch_result.final_url,
            &text,
            metadata.as_ref(),
            links.as_deref(),
        )),
        _ => Ok(format_fetch_text(
            &fetch_result.final_url,
            &text,
            metadata.as_ref(),
            links.as_deref(),
        )),
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Tool: crawl_website (#11, #12, #13, #18, #19, #20, #21, #22, #27)
// ═══════════════════════════════════════════════════════════════════════════

async fn tool_crawl_website(
    input: &Value,
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

    let start_parsed = validate_and_check_url(start_url)?;
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
        fetch_robots_txt(client, &base_origin, &custom_headers).await
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
        fetch_sitemap_urls(client, &base_origin, &robots_rules, &custom_headers).await
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
    let start_normalized = normalize_url(&start_parsed);
    pending.push_back((start_normalized, 0));

    // Add sitemap URLs at depth 1 (#12)
    for sitemap_url in &sitemap_urls {
        if let Ok(parsed) = Url::parse(sitemap_url) {
            let normalized = normalize_url(&parsed);
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
                if !is_path_allowed(parsed.path(), rules) {
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
                let result = fetch_url_with_retry(&client, &url, &headers).await;
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
                    let text = extract_text_from_html(&fr.html, &fr.final_url, &options);

                    // Duplicate content detection (#18, #50)
                    let hash = content_hash(&text);
                    if content_hashes.contains(&hash) {
                        continue;
                    }
                    content_hashes.insert(hash);

                    let excerpt = truncate_text(&text, max_text_length);

                    let metadata = if include_metadata {
                        Some(extract_metadata(&fr.html, &fr.final_url))
                    } else {
                        None
                    };

                    // Extract and categorize links
                    let raw_links = extract_links_from_html(&fr.html, &fr.final_url);
                    let categorized =
                        categorize_links(&raw_links, &start_domain, &fr.final_url.to_string());

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
                                && is_crawlable_url(&link.url)
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
        "json" => Ok(format_crawl_json(start_url, &results, &errors)),
        _ => Ok(format_crawl_text(start_url, &results, &errors, &visited)),
    }
}
