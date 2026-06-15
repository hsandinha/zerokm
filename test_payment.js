const https = require('https');

const API_KEY = "APP_USR-7492987451193165-021910-5fe91f1bef85181b8511a97ccd312d10-3214573048";

const data = JSON.stringify({
  transaction_amount: 10,
  description: "Test",
  payment_method_id: "master",
  token: "invalid_token", // Just testing if tracking_id parses tracking header
  installments: 1,
  payer: { email: "test@test.com" }
});

const options = {
  hostname: 'api.mercadopago.com',
  path: '/v1/payments',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + API_KEY,
    'X-Meli-Session-Id': 'armor.1234567890'
  }
};

const req = https.request(options, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log(body));
});

req.write(data);
req.end();
