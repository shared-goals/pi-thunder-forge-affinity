# Security policy

## Supported versions

Security fixes are provided for the latest tagged release.

## Reporting a vulnerability

Use this repository's GitHub private vulnerability reporting. Include the affected
version, impact, a minimal reproduction, and a redacted description of the Pi and
provider configuration. Do not post credentials or private endpoints in public issues.

## Scope

The extension creates an outbound header inside Pi. Header injection, unintended
provider changes, and configuration handling are in scope. Downstream routing and
cache behavior belong to the gateway's security process.

The header contains a readable username and session identifier, not an authentication
token. Configure a pseudonym if the OS account name should not reach the provider.
Percent encoding makes the username HTTP-safe; it does not conceal its value.
