import { loadAgentConfig } from './config';
import { createGatewayServer } from './server';

const config = loadAgentConfig();
const server = createGatewayServer(config, (message) => console.log(message));

server.listen(config.port, config.host, () => {
  console.log(
    `[gateway] listening on http://${config.host}:${config.port} ` +
      `(pi: ${config.pi.piBin} ${config.pi.piArgs.join(' ')})`,
  );
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));