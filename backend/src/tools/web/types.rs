// Jaskier Shared Pattern — Web Tools v2 — Types & Constants

use serde_json::Value;
use std::time::Duration;

// ═══════════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════════

pub const MAX_PAGE_SIZE: usize = 5 * 1024 * 1024;
pub const FETCH_TIMEOUT: Duration = Duration::from_secs(30);
pub const DEFAULT_CRAWL_DELAY_MS: u64 = 300;
pub const MAX_CRAWL_DEPTH: u32 = 5;
pub const MAX_CRAWL_PAGES: usize = 50;
pub const MAX_CONCURRENT: usize = 5;
pub const MAX_TOTAL_CRAWL_SECS: u64 = 180;
pub const MAX_RETRY_ATTEMPTS: u32 = 3;
pub const USER_AGENT: &str = "Jaskier-Bot/1.0 (AI Agent Tool)";

/// URL tracking parameters to strip during normalization (#14)
pub const TRACKING_PARAMS: &[&str] = &[
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "mc_cid", "mc_eid", "ref", "_ga",
];

/// File extensions to skip when crawling (#16)
pub const SKIP_EXTENSIONS: &[&str] = &[
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
pub struct FetchResult {
    pub html: String,
    pub final_url: url::Url,
    pub _status: u16,
    pub content_type: String,
}

#[derive(Clone, Debug)]
pub struct PageMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub language: Option<String>,
    pub canonical_url: Option<String>,
    pub og_tags: Vec<(String, String)>,
    pub json_ld: Vec<Value>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum LinkType {
    Internal,
    External,
    Resource,
}

#[derive(Clone, Debug)]
pub struct CategorizedLink {
    pub url: String,
    pub anchor: String,
    pub link_type: LinkType,
    pub source_url: String,
}

pub struct RobotsRules {
    pub disallowed: Vec<String>,
    pub allowed: Vec<String>,
    pub sitemaps: Vec<String>,
    pub crawl_delay: Option<u64>,
}

pub struct PageResult {
    pub url: String,
    pub text: String,
    pub metadata: Option<PageMetadata>,
    pub links: Vec<CategorizedLink>,
}

pub struct ExtractionOptions {
    pub include_images: bool,
}
