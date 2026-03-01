// Jaskier Shared Pattern — Web Tools v2 — HTML Parsing & Metadata Extraction

use scraper::{Html, Selector};
use serde_json::Value;
use std::collections::HashSet;
use url::Url;

use super::types::*;

// ═══════════════════════════════════════════════════════════════════════════
//  HTML Text Extraction (#1-#3, #6, #7, #9, #10)
// ═══════════════════════════════════════════════════════════════════════════

/// Extract readable text from HTML with enhanced formatting
pub fn extract_text_from_html(html: &str, base_url: &Url, options: &ExtractionOptions) -> String {
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

pub fn extract_metadata(html: &str, final_url: &Url) -> PageMetadata {
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
pub fn extract_links_from_html(html: &str, base_url: &Url) -> Vec<(String, String)> {
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
                    Ok(u) => super::fetch::normalize_url(&u),
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
pub fn categorize_links(
    links: &[(String, String)],
    start_domain: &str,
    source_url: &str,
) -> Vec<CategorizedLink> {
    links
        .iter()
        .map(|(url, anchor)| {
            let link_type = if !super::fetch::is_crawlable_url(url) {
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
