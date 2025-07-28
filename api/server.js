export default function handler(req, res) {
  console.log('Request received from:', req.headers.origin);
  res.status(200).json({ message: "✅ API is working and connected!" });
}
