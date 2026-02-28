// tools/pdf_tools.rs
// Jaskier Shared Pattern -- pdf_tools
//! PDF reading tool for agent function calling.

use std::path::Path;

/// Maximum PDF file size (50 MB).
const MAX_PDF_SIZE: u64 = 50 * 1024 * 1024;

/// Maximum output text length.
const MAX_OUTPUT_CHARS: usize = 6000;

/// Read and extract text from a PDF file.
///
/// # Arguments
/// * `path` - Path to the PDF file
/// * `page_range` - Optional page range like "1-5" or "3" (1-indexed)
pub async fn tool_read_pdf(path: &str, page_range: Option<&str>) -> Result<String, String> {
    let file_path = Path::new(path);

    // Validate file exists
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    // Validate extension
    match file_path.extension().and_then(|e| e.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("pdf") => {}
        _ => return Err(format!("Not a PDF file: {}", path)),
    }

    // Check file size
    let metadata = tokio::fs::metadata(file_path)
        .await
        .map_err(|e| format!("Cannot read file metadata: {}", e))?;
    if metadata.len() > MAX_PDF_SIZE {
        return Err(format!(
            "PDF too large: {} bytes (max {} MB)",
            metadata.len(),
            MAX_PDF_SIZE / (1024 * 1024)
        ));
    }

    // Read file bytes
    let bytes = tokio::fs::read(file_path)
        .await
        .map_err(|e| format!("Cannot read file: {}", e))?;

    // Extract text (blocking -- pdf-extract is synchronous)
    let text = tokio::task::spawn_blocking(move || {
        pdf_extract::extract_text_from_mem(&bytes)
            .map_err(|e| format!("PDF extraction failed: {}", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    // Split into pages (form feed character)
    let pages: Vec<&str> = text.split('\x0c').collect();
    let total_pages = pages.len();

    // Apply page range filter
    let (selected_text, range_label) = if let Some(range) = page_range {
        let (start, end) = parse_page_range(range, total_pages)?;
        let selected: String = pages[start - 1..end]
            .iter()
            .enumerate()
            .map(|(i, p)| format!("--- Page {} ---\n{}", start + i, p.trim()))
            .collect::<Vec<_>>()
            .join("\n\n");
        (selected, format!("pages {}-{} of {}", start, end, total_pages))
    } else {
        (text.clone(), format!("{} pages", total_pages))
    };

    // Build output with header
    let filename = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.pdf");

    let header = format!("### PDF: {} ({})\n\n", filename, range_label);
    let mut output = header;

    if selected_text.len() + output.len() > MAX_OUTPUT_CHARS {
        let available = MAX_OUTPUT_CHARS.saturating_sub(output.len() + 40);
        // Safe UTF-8 truncation
        let truncated: String = selected_text.chars().take(available).collect();
        output.push_str(&truncated);
        output.push_str("\n\n[... truncated ...]");
    } else {
        output.push_str(&selected_text);
    }

    Ok(output)
}

/// Parse a page range string like "1-5" or "3" into (start, end) 1-indexed.
fn parse_page_range(range: &str, total: usize) -> Result<(usize, usize), String> {
    let range = range.trim();
    if let Some((start_s, end_s)) = range.split_once('-') {
        let start: usize = start_s.trim().parse().map_err(|_| "Invalid page range start")?;
        let end: usize = end_s.trim().parse().map_err(|_| "Invalid page range end")?;
        if start < 1 || end < start || end > total {
            return Err(format!(
                "Page range {}-{} out of bounds (1-{})",
                start, end, total
            ));
        }
        Ok((start, end))
    } else {
        let page: usize = range.parse().map_err(|_| "Invalid page number")?;
        if page < 1 || page > total {
            return Err(format!("Page {} out of bounds (1-{})", page, total));
        }
        Ok((page, page))
    }
}
