-- Enable pgvector extension for vector similarity search
-- This extension provides vector data types and similarity search functions
CREATE EXTENSION IF NOT EXISTS vector;

-- Optional: Verify extension is enabled
-- SELECT * FROM pg_extension WHERE extname = 'vector';
