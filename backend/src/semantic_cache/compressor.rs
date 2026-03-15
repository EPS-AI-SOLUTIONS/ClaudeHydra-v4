// compressor.rs — AST-aware context compression using Tree-Sitter.
//
// Strips function bodies from source code, replacing them with `/* body omitted */`.
// Keeps signatures, type declarations, imports, and structural information intact.
// This reduces token count significantly while preserving the API surface for LLMs.
//
// Supported languages: Rust, TypeScript, JavaScript, Python, Go

use serde::{Deserialize, Serialize};

/// Result of compressing a code file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressedFile {
    pub path: String,
    pub language: String,
    pub original_chars: usize,
    pub compressed_chars: usize,
    pub compression_ratio: f64,
    pub content: String,
}

/// Compress source code by stripping function/method bodies.
///
/// Uses Tree-Sitter to parse the AST and identify function bodies,
/// replacing them with `/* body omitted */` placeholders.
///
/// Falls back to regex-based compression if tree-sitter parsing fails.
pub fn compress_code(path: &str, content: &str) -> CompressedFile {
    let language = detect_language(path);
    let original_chars = content.len();

    let compressed = match language.as_str() {
        "rust" => compress_rust(content),
        "typescript" | "tsx" => compress_typescript(content),
        "javascript" | "jsx" => compress_javascript(content),
        "python" => compress_python(content),
        "go" => compress_go(content),
        _ => content.to_string(), // unsupported — return as-is
    };

    let compressed_chars = compressed.len();
    let compression_ratio = if original_chars > 0 {
        1.0 - (compressed_chars as f64 / original_chars as f64)
    } else {
        0.0
    };

    CompressedFile {
        path: path.to_string(),
        language,
        original_chars,
        compressed_chars,
        compression_ratio,
        content: compressed,
    }
}

/// Async wrapper that runs compression on a blocking thread.
pub async fn compress_code_async(path: String, content: String) -> CompressedFile {
    tokio::task::spawn_blocking(move || compress_code(&path, &content))
        .await
        .unwrap_or_else(|_| CompressedFile {
            path: String::new(),
            language: "unknown".to_string(),
            original_chars: 0,
            compressed_chars: 0,
            compression_ratio: 0.0,
            content: String::new(),
        })
}

// ── Language Detection ───────────────────────────────────────────────────────

fn detect_language(path: &str) -> String {
    let ext = path
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "rs" => "rust",
        "ts" => "typescript",
        "tsx" => "tsx",
        "js" => "javascript",
        "jsx" => "jsx",
        "py" => "python",
        "go" => "go",
        _ => "unknown",
    }
    .to_string()
}

// ── Tree-Sitter Compression (per language) ───────────────────────────────────

fn compress_rust(content: &str) -> String {
    let mut parser = tree_sitter::Parser::new();
    let language = tree_sitter_rust::LANGUAGE;
    if parser.set_language(&language.into()).is_err() {
        return compress_rust_regex(content);
    }

    let tree = match parser.parse(content, None) {
        Some(t) => t,
        None => return compress_rust_regex(content),
    };

    let root = tree.root_node();
    let mut result = String::with_capacity(content.len());
    let mut last_end = 0;

    // Walk through top-level nodes
    let mut cursor = root.walk();
    for node in root.children(&mut cursor) {
        match node.kind() {
            "function_item" | "impl_item" => {
                // For functions: keep signature, replace body
                if let Some(body) = node.child_by_field_name("body") {
                    // Copy everything up to the body
                    let sig_end = body.start_byte();
                    result.push_str(&content[last_end..sig_end]);
                    result.push_str("{ /* body omitted */ }");
                    last_end = body.end_byte();
                } else {
                    // No body — keep as-is (forward declaration, trait method sig)
                    result.push_str(&content[last_end..node.end_byte()]);
                    last_end = node.end_byte();
                }
            }
            _ => {
                // Keep structs, enums, traits, use statements, etc. as-is
            }
        }
    }

    // Append remaining content
    result.push_str(&content[last_end..]);
    result
}

fn compress_typescript(content: &str) -> String {
    let mut parser = tree_sitter::Parser::new();
    let language = tree_sitter_typescript::LANGUAGE_TYPESCRIPT;
    if parser.set_language(&language.into()).is_err() {
        return compress_js_regex(content);
    }

    let tree = match parser.parse(content, None) {
        Some(t) => t,
        None => return compress_js_regex(content),
    };

    compress_js_tree(&tree, content)
}

fn compress_javascript(content: &str) -> String {
    let mut parser = tree_sitter::Parser::new();
    let language = tree_sitter_javascript::LANGUAGE;
    if parser.set_language(&language.into()).is_err() {
        return compress_js_regex(content);
    }

    let tree = match parser.parse(content, None) {
        Some(t) => t,
        None => return compress_js_regex(content),
    };

    compress_js_tree(&tree, content)
}

fn compress_js_tree(tree: &tree_sitter::Tree, content: &str) -> String {
    let root = tree.root_node();
    let mut result = String::with_capacity(content.len());
    let mut last_end = 0;

    let mut cursor = root.walk();
    for node in root.children(&mut cursor) {
        match node.kind() {
            "function_declaration" | "generator_function_declaration" => {
                if let Some(body) = node.child_by_field_name("body") {
                    result.push_str(&content[last_end..body.start_byte()]);
                    result.push_str("{ /* body omitted */ }");
                    last_end = body.end_byte();
                }
            }
            "class_declaration" => {
                // Compress methods inside class
                result.push_str(&content[last_end..node.start_byte()]);
                result.push_str(&compress_class_body(node, content));
                last_end = node.end_byte();
            }
            "export_statement" => {
                // Check if the exported thing is a function
                let mut inner_cursor = node.walk();
                for child in node.children(&mut inner_cursor) {
                    if child.kind() == "function_declaration"
                        || child.kind() == "generator_function_declaration"
                    {
                        if let Some(body) = child.child_by_field_name("body") {
                            result.push_str(&content[last_end..body.start_byte()]);
                            result.push_str("{ /* body omitted */ }");
                            last_end = body.end_byte();
                        }
                    }
                }
            }
            _ => {}
        }
    }

    result.push_str(&content[last_end..]);
    result
}

fn compress_class_body(node: tree_sitter::Node<'_>, content: &str) -> String {
    let mut result = String::new();
    let mut last_end = node.start_byte();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        if child.kind() == "class_body" {
            let mut inner_cursor = child.walk();
            for item in child.children(&mut inner_cursor) {
                if item.kind() == "method_definition" {
                    if let Some(body) = item.child_by_field_name("body") {
                        result.push_str(&content[last_end..body.start_byte()]);
                        result.push_str("{ /* body omitted */ }");
                        last_end = body.end_byte();
                    }
                }
            }
        }
    }

    result.push_str(&content[last_end..node.end_byte()]);
    result
}

fn compress_python(content: &str) -> String {
    let mut parser = tree_sitter::Parser::new();
    let language = tree_sitter_python::LANGUAGE;
    if parser.set_language(&language.into()).is_err() {
        return compress_python_regex(content);
    }

    let tree = match parser.parse(content, None) {
        Some(t) => t,
        None => return compress_python_regex(content),
    };

    let root = tree.root_node();
    let mut result = String::with_capacity(content.len());
    let mut last_end = 0;

    let mut cursor = root.walk();
    for node in root.children(&mut cursor) {
        match node.kind() {
            "function_definition" => {
                if let Some(body) = node.child_by_field_name("body") {
                    result.push_str(&content[last_end..body.start_byte()]);
                    result.push_str("...\n    # body omitted");
                    last_end = body.end_byte();
                }
            }
            "class_definition" => {
                // Compress methods inside class
                result.push_str(&content[last_end..node.start_byte()]);
                result.push_str(&compress_python_class(node, content));
                last_end = node.end_byte();
            }
            _ => {}
        }
    }

    result.push_str(&content[last_end..]);
    result
}

fn compress_python_class(node: tree_sitter::Node<'_>, content: &str) -> String {
    let mut result = String::new();
    let mut last_end = node.start_byte();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        if child.kind() == "block" {
            let mut inner_cursor = child.walk();
            for item in child.children(&mut inner_cursor) {
                if item.kind() == "function_definition" {
                    if let Some(body) = item.child_by_field_name("body") {
                        result.push_str(&content[last_end..body.start_byte()]);
                        result.push_str("...\n        # body omitted");
                        last_end = body.end_byte();
                    }
                }
            }
        }
    }

    result.push_str(&content[last_end..node.end_byte()]);
    result
}

fn compress_go(content: &str) -> String {
    let mut parser = tree_sitter::Parser::new();
    let language = tree_sitter_go::LANGUAGE;
    if parser.set_language(&language.into()).is_err() {
        return compress_go_regex(content);
    }

    let tree = match parser.parse(content, None) {
        Some(t) => t,
        None => return compress_go_regex(content),
    };

    let root = tree.root_node();
    let mut result = String::with_capacity(content.len());
    let mut last_end = 0;

    let mut cursor = root.walk();
    for node in root.children(&mut cursor) {
        if node.kind() == "function_declaration" || node.kind() == "method_declaration" {
            if let Some(body) = node.child_by_field_name("body") {
                result.push_str(&content[last_end..body.start_byte()]);
                result.push_str("{ /* body omitted */ }");
                last_end = body.end_byte();
            }
        }
    }

    result.push_str(&content[last_end..]);
    result
}

// ── Regex Fallbacks ──────────────────────────────────────────────────────────

fn compress_rust_regex(content: &str) -> String {
    // Simple regex: replace fn bodies with placeholder
    let re = regex::Regex::new(r"(?m)((?:pub\s+)?(?:async\s+)?fn\s+\w+[^{]*)\{[^}]*(?:\{[^}]*\}[^}]*)*\}")
        .unwrap();
    re.replace_all(content, "$1{ /* body omitted */ }").to_string()
}

fn compress_js_regex(content: &str) -> String {
    let re = regex::Regex::new(
        r"(?m)((?:export\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)[^{]*)\{[^}]*(?:\{[^}]*\}[^}]*)*\}",
    )
    .unwrap();
    re.replace_all(content, "$1{ /* body omitted */ }").to_string()
}

fn compress_python_regex(content: &str) -> String {
    // Python is harder with regex due to indentation-based blocks
    // Simplified: just keep def lines and replace body with pass
    let mut result = Vec::new();
    let mut in_function = false;
    let mut fn_indent = 0;

    for line in content.lines() {
        let indent = line.len() - line.trim_start().len();
        let trimmed = line.trim();

        if trimmed.starts_with("def ") || trimmed.starts_with("async def ") {
            in_function = true;
            fn_indent = indent;
            result.push(line.to_string());
            let body_indent = " ".repeat(fn_indent + 4);
            result.push(format!("{}...\n{}# body omitted", body_indent, body_indent));
        } else if in_function {
            if indent > fn_indent && !trimmed.is_empty() {
                // Skip body lines
                continue;
            }
            in_function = false;
            result.push(line.to_string());
        } else {
            result.push(line.to_string());
        }
    }

    result.join("\n")
}

fn compress_go_regex(content: &str) -> String {
    let re = regex::Regex::new(r"(?m)(func\s+[^{]*)\{[^}]*(?:\{[^}]*\}[^}]*)*\}")
        .unwrap();
    re.replace_all(content, "$1{ /* body omitted */ }").to_string()
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_language() {
        assert_eq!(detect_language("src/main.rs"), "rust");
        assert_eq!(detect_language("app.tsx"), "tsx");
        assert_eq!(detect_language("utils.py"), "python");
        assert_eq!(detect_language("server.go"), "go");
        assert_eq!(detect_language("README.md"), "unknown");
    }

    #[test]
    fn test_compress_rust_basic() {
        let input = r#"
pub struct Foo {
    pub bar: String,
}

pub fn hello(name: &str) -> String {
    let greeting = format!("Hello, {}!", name);
    println!("{}", greeting);
    greeting
}
"#;
        let result = compress_code("test.rs", input);
        assert!(result.content.contains("pub struct Foo"));
        assert!(result.content.contains("pub fn hello"));
        assert!(result.content.contains("/* body omitted */"));
        assert!(result.compression_ratio > 0.0);
    }

    #[test]
    fn test_compress_python_basic() {
        let input = r#"
class MyClass:
    def __init__(self, x):
        self.x = x
        self.y = x * 2

    def compute(self):
        result = self.x + self.y
        return result
"#;
        let result = compress_code("test.py", input);
        assert!(result.content.contains("class MyClass"));
        assert!(result.content.contains("def __init__"));
        assert!(result.content.contains("body omitted"));
    }

    #[test]
    fn test_compress_preserves_imports() {
        let input = r#"
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

pub fn process(data: &HashMap<String, String>) -> Vec<String> {
    data.values().cloned().collect()
}
"#;
        let result = compress_code("test.rs", input);
        assert!(result.content.contains("use std::collections::HashMap"));
        assert!(result.content.contains("use serde::{Serialize, Deserialize}"));
    }

    #[test]
    fn test_compress_unknown_language() {
        let input = "some content here";
        let result = compress_code("test.txt", input);
        assert_eq!(result.content, input);
        assert_eq!(result.compression_ratio, 0.0);
    }
}
