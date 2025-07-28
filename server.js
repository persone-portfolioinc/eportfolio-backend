import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs/promises';

export const config = {
  api: {
    bodyParser: false,
  },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // ✅ CORS headers for your frontend
  res.setHeader('Access-Control-Allow-Origin', 'https://eportfoliogenerator.netlify.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ✅ Log the request origin
  console.log('Request received from:', req.headers.origin);
  
  // ✅ Handle preflight (OPTIONS) requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const form = formidable();
      const [fields, files] = await form.parse(req);
      const resumeFile = files.resume[0];
      const fileBuffer = await fs.readFile(resumeFile.filepath);

      const file = await openai.files.create({
        file: fileBuffer,
        purpose: 'assistants',
      });

      const assistant = await openai.beta.assistants.create({
        name: 'CV Screener',
        instructions: 'You are a helpful assistant who reads resumes and generates e-portfolios.',
        tools: [{ type: 'file_search' }],
        model: 'gpt-4-1106-preview',
      });

      const thread = await openai.beta.threads.create();

      await openai.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: 'Please use this resume to generate an e-portfolio.',
        file_ids: [file.id],
      });

      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id,
      });

      res.status(200).json({ run, thread });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: error.message || 'Something went wrong' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
