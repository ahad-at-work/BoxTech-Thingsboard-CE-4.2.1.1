# BoxTech ThingsBoard CE

BoxTech's IoT platform, built on a source-level fork of [ThingsBoard](https://thingsboard.io) Community Edition **v4.2.1.1**.

This fork powers BoxTech's IoT deployments — including Minew BLE gateway integrations, indoor asset/personnel tracking via trilateration, and multi-use-case client dashboards — deployed on BoxTech's own infrastructure.

## About This Fork

This is not the upstream ThingsBoard repository. It includes:
- BoxTech branding (sidebar, login page, theme, logo assets)
- Custom rule chains and TBEL scripts for BLE device decoding (Minew and non-Minew tags)
- Dual-gateway trilateration support for indoor asset tracking
- Custom dashboards for visitor/contractor badge tracking, vibration/machine health monitoring, and more

For general ThingsBoard documentation, see [thingsboard.io/docs](https://thingsboard.io/docs).

## Deployment

Deployed via Docker Compose. See `docker/` for compose files and environment configuration.

## Upstream Project

This fork is based on the open-source [ThingsBoard](https://github.com/thingsboard/thingsboard) IoT platform, released under the [Apache 2.0 License](./LICENSE).

## Internal Notes

For BoxTech-specific deployment details, credentials, and architecture notes, see internal documentation (not included in this public-facing README).
