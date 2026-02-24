/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly ANTHROPIC_API_KEY?: string;
  readonly OPENAI_API_KEY?: string;
  readonly GOOGLE_API_KEY?: string;
  readonly GROQ_API_KEY?: string;
  readonly MISTRAL_API_KEY?: string;
  readonly OPENROUTER_API_KEY?: string;
  readonly TOGETHER_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
