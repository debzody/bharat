const { getStore } = require('@netlify/blobs');

const DEFAULT_PACKAGES = [
  {
    id: 'budget',
    name: 'Budget Andaman Escape',
    desc: '4N/5D | Port Blair + Havelock | Basic Hotels + Ferries',
    price: 15999,
    rating: 4.2,
    image: '/images/beach1.jpg',
    inclusions: ['Hotels', 'Ferries', 'Breakfast'],
    visible: true
  },
  {
    id: 'standard',
    name: 'Standard Andaman Bliss',
    desc: '6N/7D | Port Blair + Havelock + Neil | Deluxe + Activities',
    price: 21999,
    rating: 4.6,
    image: '/images/beach2.jpg',
    inclusions: ['Deluxe Hotels', 'Premium Ferries', 'Snorkeling'],
    visible: true
  },
  {
    id: 'luxury',
    name: 'Luxury Andaman Retreat',
    desc: '6N/7D | All Islands | 5* Resorts + Scuba + Private Transfers',
    price: 28999,
    rating: 4.8,
    image: '/images/beach3.jpg',
    inclusions: ['5* Resorts', 'VIP Ferries', 'Scuba Dive'],
    visible: true
  },
  {
    id: 'honeymoon',
    name: 'Honeymoon Paradise',
    desc: '5N/6D | Romantic Stays + Candlelight Dinner + Photos',
    price: 24999,
    rating: 4.9,
    image: '/images/beach4.jpg',
    inclusions: ['Romantic Setup', 'Photoshoot', 'Dinner'],
    visible: true
  },
  {
    id: 'test',
    name: '🧪 Payment Test Package',
    desc: 'Test the live payment gateway for ₹1 only',
    price: 1,
    rating: 5.0,
    image: '/images/beach1.jpg',
    inclusions: ['Live Payment', 'Instant'],
    visible: true
  }
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

const ADMIN_TOKEN = 'deb2024';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  try {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token  = process.env.NETLIFY_AUTH_TOKEN;
    const storeOpts = siteID && token
      ? { name: 'site-data', siteID, token }
      : 'site-data';
    const store = getStore(storeOpts);

    if (event.httpMethod === 'GET') {
      const raw = await store.get('packages').catch(() => null);
      const data = raw ? JSON.parse(raw) : null;
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify(data || DEFAULT_PACKAGES)
      };
    }

    if (event.httpMethod === 'POST') {
      const adminToken = (event.headers['x-admin-token'] || event.headers['X-Admin-Token'] || '').trim();
      if (adminToken !== ADMIN_TOKEN) {
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      // Validate it's a valid JSON array
      const packages = JSON.parse(event.body);
      if (!Array.isArray(packages)) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Expected array of packages' }) };
      }
      await store.set('packages', JSON.stringify(packages));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, count: packages.length }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('packages fn error:', err.message);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify(DEFAULT_PACKAGES)
    };
  }
};