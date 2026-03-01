// Jaskier Shared Pattern — Web Tools v2
// Comprehensive web scraping tools with 50 improvements:
// SSRF prevention, robots.txt, sitemap, concurrent crawl, HTML tables/code/links,
// metadata extraction (OG, JSON-LD, canonical), retry with backoff, content dedup,
// URL normalization, configurable options, JSON output format.
//
// Split into sub-modules:
//   types.rs — type definitions and constants
//   html.rs  — HTML parsing, metadata extraction, link categorization
//   fetch.rs — URL validation, SSRF, HTTP fetch, robots.txt, sitemap, utilities, fetch_webpage
//   crawl.rs — multi-page crawler

pub mod crawl;
pub mod fetch;
pub mod html;
pub mod types;

use std::collections::HashSet;

use serde_json::{json, Value};
use url::Url;

use crate::models::ToolDefinition;
use crate::state::AppState;

pub use types::*;

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
        "fetch_webpage" => match fetch::tool_fetch_webpage(input, &state.http_client).await {
            Ok(text) => (text, false),
            Err(e) => (format!("TOOL_ERROR: {}", e), true),
        },
        "crawl_website" => match crawl::tool_crawl_website(input, &state.http_client).await {
            Ok(text) => (text, false),
            Err(e) => (format!("TOOL_ERROR: {}", e), true),
        },
        _ => (format!("Unknown web tool: {}", tool_name), true),
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Output Formatting (#45, #46)
// ═══════════════════════════════════════════════════════════════════════════

pub fn format_fetch_text(
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

pub fn format_fetch_json(
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

pub fn format_crawl_text(
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
                    out.push_str(&format!("- [{}]({}) \u{2190} {}\n", label, l.url, l.source_url));
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

pub fn format_crawl_json(
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
