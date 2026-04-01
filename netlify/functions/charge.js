const https = require('https');

exports.handler = async function(event, context) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const body = JSON.parse(event.body);
    const { token, amount, description, currency = 'thb' } = body;

    if (!token || !amount) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing token or amount' })
      };
    }

    // Charge via Omise API
    const result = await chargeOmise({
      token,
      amount: Math.round(amount * 100), // Omise uses satang (1 THB = 100 satang)
      currency,
      description: description || 'Mic : Electric Car Booking'
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        chargeId: result.id,
        status: result.status,
        amount: result.amount / 100,
        currency: result.currency
      })
    };

  } catch (err) {
    console.error('Charge error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Charge failed' })
    };
  }
};

function chargeOmise({ token, amount, currency, description }) {
  return new Promise((resolve, reject) => {
    const secretKey = process.env.OMISE_SECRET_KEY;
    if (!secretKey) return reject(new Error('Missing OMISE_SECRET_KEY'));

    const postData = new URLSearchParams({
      amount: amount.toString(),
      currency,
      card: token,
      description
    }).toString();

    const auth = Buffer.from(secretKey + ':').toString('base64');

    const options = {
      hostname: 'api.omise.co',
      path: '/charges',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.object === 'error') {
            reject(new Error(parsed.message));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Invalid response from Omise'));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
