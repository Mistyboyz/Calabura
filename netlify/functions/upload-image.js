const https = require('https');
const crypto = require('crypto');
 
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};
 
exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
 
  try {
    const { image, filename } = JSON.parse(event.body);
    if (!image) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No image provided' }) };
 
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey    = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
 
    if (!cloudName || !apiKey || !apiSecret) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Cloudinary not configured' }) };
    }
 
    const timestamp = Math.round(Date.now() / 1000);
    const folder = 'mic-electric-car/cars';
    const publicId = `${folder}/${filename || 'car_' + timestamp}`;
 
    // Generate signature
    const signStr = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha256').update(signStr).digest('hex');
 
    // Upload to Cloudinary via API
    const result = await uploadToCloudinary({
      image, timestamp, signature, apiKey, cloudName, folder, publicId
    });
 
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        url: result.secure_url,
        publicId: result.public_id
      })
    };
 
  } catch(err) {
    console.error('Upload error:', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message || 'Upload failed' }) };
  }
};
 
function uploadToCloudinary({ image, timestamp, signature, apiKey, cloudName, folder, publicId }) {
  return new Promise((resolve, reject) => {
    // Build multipart form data
    const boundary = '----FormBoundary' + Date.now();
    const fields = { file: image, timestamp: String(timestamp), signature, api_key: apiKey, folder, public_id: publicId };
 
    let body = '';
    for (const [key, val] of Object.entries(fields)) {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`;
    }
    body += `--${boundary}--\r\n`;
 
    const options = {
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${cloudName}/image/upload`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
 
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message));
          else resolve(parsed);
        } catch(e) { reject(new Error('Invalid response from Cloudinary')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
