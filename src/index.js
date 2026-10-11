export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // API: GET /api/rsvps - fetch all guests from D1 database
    if (url.pathname === '/api/rsvps' && request.method === 'GET') {
      try {
        const { results } = await env.wedding_db.prepare(
          "SELECT id, name, phone, email, relation, plus_one as plusOne, attendance, song, diet, message, created_at as date FROM rsvps ORDER BY created_at DESC"
        ).all();
        return new Response(JSON.stringify(results || []), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // API: POST /api/rsvps - submit or update RSVP in D1 database
    if (url.pathname === '/api/rsvps' && request.method === 'POST') {
      try {
        const body = await request.json();
        const id = body.id || crypto.randomUUID();
        await env.wedding_db.prepare(`
          INSERT INTO rsvps (id, name, phone, email, relation, plus_one, attendance, song, diet, message)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            phone = excluded.phone,
            email = excluded.email,
            relation = excluded.relation,
            plus_one = excluded.plus_one,
            attendance = excluded.attendance,
            song = excluded.song,
            diet = excluded.diet,
            message = excluded.message
        `).bind(
          id,
          body.name || '',
          body.phone || '',
          body.email || '',
          body.relation || '',
          body.plusOne || 0,
          body.attendance || 'attending',
          body.song || '',
          body.diet || '',
          body.message || ''
        ).run();

        return new Response(JSON.stringify({ success: true, id }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // API: DELETE /api/rsvps/:id - delete a guest record
    if (url.pathname.startsWith('/api/rsvps/') && request.method === 'DELETE') {
      try {
        const id = url.pathname.replace('/api/rsvps/', '');
        await env.wedding_db.prepare("DELETE FROM rsvps WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // Default: serve static assets from public directory
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
