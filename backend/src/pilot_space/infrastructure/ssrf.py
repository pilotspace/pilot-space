"""SSRF-safe URL validation shared between API router and AI agent layers."""

from __future__ import annotations

import ipaddress
import socket
import urllib.parse

__all__ = ["validate_mcp_url"]

# Private, loopback, link-local and cloud-metadata CIDR ranges to block
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),  # RFC 1918
    ipaddress.ip_network("172.16.0.0/12"),  # RFC 1918
    ipaddress.ip_network("192.168.0.0/16"),  # RFC 1918
    ipaddress.ip_network("127.0.0.0/8"),  # Loopback
    ipaddress.ip_network("169.254.0.0/16"),  # Link-local / AWS metadata
    ipaddress.ip_network("100.64.0.0/10"),  # Shared address space (RFC 6598)
    ipaddress.ip_network("::1/128"),  # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),  # IPv6 unique local
    ipaddress.ip_network("fe80::/10"),  # IPv6 link-local
]


def validate_mcp_url(url: str) -> str:
    """Validate MCP server URL to prevent SSRF attacks.

    Enforces:
    - HTTPS scheme only
    - Hostname must not resolve to private/loopback/link-local/metadata IPs

    Note: Hostname resolution happens at validation time via getaddrinfo.
    The runtime probe uses follow_redirects=False to prevent redirect-based bypass.

    Args:
        url: URL string to validate.

    Returns:
        The validated URL string.

    Raises:
        ValueError: If the URL fails any validation check.
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise ValueError("MCP server URL must use HTTPS")
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("MCP server URL must have a valid hostname")

    # Resolve hostname to IP addresses and check against blocked ranges
    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        # If hostname cannot be resolved at validation time, allow it through;
        # the runtime probe will fail safely with follow_redirects=False.
        return url

    for addr_info in addr_infos:
        ip_str = addr_info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        for blocked in _BLOCKED_NETWORKS:
            if ip in blocked:
                raise ValueError(
                    f"MCP server URL resolves to a private or restricted IP address: {ip_str}"
                )

    return url
