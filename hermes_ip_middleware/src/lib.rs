use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::str::FromStr;
/// Zeronotiza una IP:
/// IPv4: Pone a 0 el último octeto.
/// IPv6: Pone a 0 los últimos 80 bits (5 de los 8 hextetos).
fn zeronotize_ip(ip_str: &str) -> String {
    match IpAddr::from_str(ip_str) {
        Ok(IpAddr::V4(addr)) => {
            let octets = addr.octets();
            // Poner el último octeto a 0
            let new_addr = Ipv4Addr::new(octets[0], octets[1], octets[2], 0);
            new_addr.to_string()
        }
        Ok(IpAddr::V6(addr)) => {
            let segments = addr.segments();
            // IPv6 tiene 8 segmentos de 16 bits (128 bits total).
            // Poner a 0 los últimos 64 bits significa poner a 0 los últimos 4 segmentos (GDPR compliant).
            let new_addr = Ipv6Addr::new(
                segments[0],
                segments[1],
                segments[2],
                segments[3],
                0,
                0,
                0,
                0,
            );
            new_addr.to_string()
        }
        Err(_) => {
            // Regla de privacidad estricta: Si no podemos parsear y anonimizar con certeza,
            // CENSURAMOS la IP por completo para evitar leaks accidentales.
            "REDACTED".to_string()
        }
    }
}
/// Función C-FFI invocada por Python.
/// Lee un string C (`ip_ptr`), lo anonimiza y devuelve un nuevo string C (allocated on heap).
/// Python DEBE llamar a `free_anonymized_ip` para liberar la memoria devuelta.
#[no_mangle]
pub extern "C" fn anonymize_ip(ip_ptr: *const c_char) -> *mut c_char {
    if ip_ptr.is_null() {
        return std::ptr::null_mut();
    }
    let c_str = unsafe { CStr::from_ptr(ip_ptr) };
    let ip_str = match c_str.to_str() {
        Ok(s) => s,
        Err(_) => return std::ptr::null_mut(),
    };
    let anonymized = zeronotize_ip(ip_str);
    let c_string = match CString::new(anonymized) {
        Ok(c) => c,
        Err(_) => return std::ptr::null_mut(),
    };
    c_string.into_raw()
}
/// Libera la memoria asignada por `anonymize_ip`.
#[no_mangle]
pub extern "C" fn free_anonymized_ip(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        let _ = CString::from_raw(ptr);
    }
}


#[cfg(test)]
mod tests;