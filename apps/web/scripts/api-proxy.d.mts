export function readApiProxyConfig(env?: NodeJS.ProcessEnv): {
  origin: URL;
  fallbackIPs: string[];
};

export function proxyApiRequest(
  request: Request,
  options?: {
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    maxBodyBytes?: number;
  },
): Promise<Response>;
