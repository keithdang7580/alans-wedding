export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ADMIN_PIN = env.ADMIN_PIN || '19677142246466';

    function isAdmin(req) {
      const pin = req.headers.get('X-Admin-PIN') || req.headers.get('x-admin-pin');
      return pin === ADMIN_PIN;
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Admin-PIN, Authorization',
        },
      });
    }

    // API: POST /api/admin/verify - securely verify admin PIN
    if (url.pathname === '/api/admin/verify' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (body.pin === ADMIN_PIN) {
          return new Response(JSON.stringify({ success: true }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
        return new Response(JSON.stringify({ success: false, error: 'Mã PIN không đúng' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // API: GET /api/rsvps - fetch guests (Admin gets full data; public gets sanitized fields)
    if (url.pathname === '/api/rsvps' && request.method === 'GET') {
      try {
        const admin = isAdmin(request);
        const sql = admin
          ? "SELECT id, name, phone, email, relation, plus_one as plusOne, attendance, song, diet, message, created_at as date FROM rsvps ORDER BY created_at DESC"
          : "SELECT id, name, relation, plus_one as plusOne, attendance, message, created_at as date FROM rsvps ORDER BY created_at DESC";
        const { results } = await env.wedding_db.prepare(sql).all();
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

    // API: DELETE /api/rsvps/:id - STRICTLY ADMIN ONLY
    if (url.pathname.startsWith('/api/rsvps/') && request.method === 'DELETE') {
      if (!isAdmin(request)) {
        return new Response(JSON.stringify({ error: 'Quyền truy cập bị từ chối: Chỉ có Alan & Bảo Hoàng Huỳnh mới có quyền xóa khách mời (Admin PIN required).' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
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

    // API: GET /api/homepage-photos - fetch homepage official gallery photos
    if (url.pathname === '/api/homepage-photos' && request.method === 'GET') {
      try {
        const row = await env.wedding_db.prepare(
          "SELECT caption FROM photos WHERE id = 'config:homepage_photos' LIMIT 1"
        ).first();
        if (row && row.caption) {
          return new Response(row.caption, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-store',
            },
          });
        }
        // Default official photos if none saved yet
        const defaultPhotos = [
          { id: 'def-1', img: 'couple_stage.jpg', title: 'Alan & Bảo Hoàng Huỳnh', tag: 'Ảnh Bìa (Cover)' },
          { id: 'def-2', img: 'couple_beach.jpg', title: 'Alan & Bảo Hoàng Huỳnh - Beach Sunset', tag: 'Kỷ Niệm (Beach)' },
          { id: 'def-3', img: 'couple_dodgers.jpg', title: 'Alan & Bảo Hoàng Huỳnh - Dodger Stadium', tag: 'Kỷ Niệm (Stadium)' }
        ];
        return new Response(JSON.stringify(defaultPhotos), {
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

    // API: POST /api/homepage-photos - update homepage official gallery photos (Admin PIN only)
    if (url.pathname === '/api/homepage-photos' && request.method === 'POST') {
      if (!isAdmin(request)) {
        return new Response(JSON.stringify({ error: 'Quyền truy cập bị từ chối: Chỉ có Alan & Bảo Hoàng Huỳnh mới có quyền chỉnh sửa ảnh trang chủ (Admin PIN required).' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      try {
        const body = await request.json();
        const photosJson = JSON.stringify(body.photos || []);
        // Save using SQLite ON CONFLICT replacement
        await env.wedding_db.prepare(`
          INSERT INTO photos (id, image_data, caption)
          VALUES ('config:homepage_photos', 'meta', ?)
          ON CONFLICT(id) DO UPDATE SET caption = excluded.caption
        `).bind(photosJson).run();

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

    // API: GET /api/photos - fetch guest uploaded photos (strictly excluding homepage config)
    if (url.pathname === '/api/photos' && request.method === 'GET') {
      try {
        const { results } = await env.wedding_db.prepare(
          "SELECT id, image_data, caption, created_at FROM photos WHERE id NOT LIKE 'config:%' ORDER BY created_at DESC LIMIT 60"
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

    // API: POST /api/photos - upload a guest photo
    if (url.pathname === '/api/photos' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body.image_data) {
          return new Response(JSON.stringify({ error: 'Missing image_data' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        const id = body.id || crypto.randomUUID();
        await env.wedding_db.prepare(
          "INSERT INTO photos (id, image_data, caption) VALUES (?, ?, ?)"
        ).bind(id, body.image_data, body.caption || '').run();

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

    // API: DELETE /api/photos/:id - STRICTLY ADMIN ONLY
    if (url.pathname.startsWith('/api/photos/') && request.method === 'DELETE') {
      if (!isAdmin(request)) {
        return new Response(JSON.stringify({ error: 'Quyền truy cập bị từ chối: Chỉ có Alan & Bảo Hoàng Huỳnh mới có quyền xóa ảnh (Admin PIN required).' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      try {
        const id = url.pathname.replace('/api/photos/', '');
        await env.wedding_db.prepare("DELETE FROM photos WHERE id = ?").bind(id).run();
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

    // Direct /admin route redirect to admin dashboard anchor
    if (url.pathname === '/admin') {
      return Response.redirect(`${url.origin}/#admin`, 302);
    }

    // Default: serve static assets from public directory
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
