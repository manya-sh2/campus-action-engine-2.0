const express = require('express');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const requireAuth = require('../middlewares/auth.middleware');
const { createMcpServerForUser } = require('../mcp/server');

const router = express.Router();

// The MCP endpoint sits behind the EXACT SAME session-cookie auth as
// every other authenticated route in this app - no separate MCP auth
// scheme. req.user is established by requireAuth before any MCP code
// runs, and a fresh McpServer bound to that one user is created per
// request (stateless mode - see mcp/server.js for why binding via
// closure rather than a userId argument is what makes cross-user access
// structurally impossible, not just policy).
router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const server = createMcpServerForUser(req.user);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'MCP request failed',
      });
    }
  }
});

// Stateless mode doesn't support the GET (server-initiated stream) or
// DELETE (session termination) verbs used by stateful MCP sessions.
router.get('/', (req, res) => {
  res.status(405).json({ success: false, message: 'Method not allowed in stateless MCP mode.' });
});
router.delete('/', (req, res) => {
  res.status(405).json({ success: false, message: 'Method not allowed in stateless MCP mode.' });
});

module.exports = router;
