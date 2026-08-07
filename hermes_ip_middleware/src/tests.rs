#[cfg(test)]
mod tests {
    use crate::zeronotize_ip;

    #[test]
    fn test_zeronotize_ipv4() {
        assert_eq!(zeronotize_ip("192.168.1.42"), "192.168.1.0");
        assert_eq!(zeronotize_ip("8.8.8.8"), "8.8.8.0");
    }

    #[test]
    fn test_zeronotize_ipv6() {
        assert_eq!(zeronotize_ip("2001:db8:85a3:8d3:1319:8a2e:370:7348"), "2001:db8:85a3:8d3::");
        assert_eq!(zeronotize_ip("2001:db8::1:2:3:4"), "2001:db8::");
    }

    #[test]
    fn test_zeronotize_invalid() {
        assert_eq!(zeronotize_ip("invalid_ip"), "REDACTED");
        assert_eq!(zeronotize_ip(""), "REDACTED");
    }
}
