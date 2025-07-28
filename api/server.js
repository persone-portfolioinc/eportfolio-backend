export default function handler(req, res) {
  // Allow requests from your frontend domain (Netlify)
  res.setHeader('Access-Control-Allow-Origin', 'https://eportfoliogenerator.netlify.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Log the origin for debugging
  console.log('✅ Request received from:', req.headers.origin);

  // Respond with a simple message
  res.status(200).json({ message: "✅ API is working and connected!" });
}
