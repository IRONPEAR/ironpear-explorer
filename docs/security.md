# Explorer Security Boundary

IronPear Explorer V1 is read-only.

The explorer must not contain or request:

- validator account seeds
- Aura or GRANDPA seeds
- node private keys
- council signing material
- faucet signing material
- SSH or VPS credentials
- keystores
- private operator notes

The browser UI talks to the explorer API only. The API talks to public IronPear RPC using read-only calls. V1 must not expose transaction submission, wallet connection, governance controls, or unsafe RPC forwarding.

If a JSON-RPC gateway is added later, it must fail closed and allow only explicit safe read methods.
