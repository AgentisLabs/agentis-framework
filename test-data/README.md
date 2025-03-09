# Knowledge Base Chunking Test

This directory contains test data for the document chunking functionality in the knowledge base.

## Generated Files

When you run the test script, the following files will be created in this directory:

- `ai-history.txt`: A long document about AI History (50,000 characters)
- `climate-change.txt`: A long document about Climate Change (40,000 characters)
- `quantum-computing.txt`: A long document about Quantum Computing (30,000 characters)
- `knowledge-base.json`: Persistent storage for the knowledge base
- `knowledge-graph.json`: Persistent storage for the knowledge graph

## Testing the Feature

To test the document chunking functionality:

1. Make sure you have an `OPENAI_API_KEY` environment variable set

2. Run the test script:
   ```
   npm run test-kb
   ```

3. Ask questions about the topics in the documents, and see how the agent retrieves specific chunks:
   - "Tell me about the history of AI"
   - "What are the key concepts in quantum computing?"
   - "Explain the effects of climate change"
   - "What are the applications of quantum computing?"
   - "What challenges exist in AI research?"

## What to Observe

- Notice how the agent retrieves specific chunks relevant to your question, rather than entire documents
- The agent can find information buried deep within lengthy documents
- Compare responses between general and specific queries

## Modifying Test Data

You can edit the test script in `scripts/test-knowledge-chunks.ts` to:
- Change document sizes
- Modify chunk size and overlap parameters
- Add more documents or FAQs
- Test different retrieval scenarios