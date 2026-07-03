pub mod constants;
pub mod state;
pub mod dh_ratchet;
pub mod x3dh;

pub use constants::*;
pub use state::*;
pub use dh_ratchet::*;
pub use x3dh::*;

use x25519_dalek::PublicKey;

/// Gestor Central de Trinquetes Activos (RatchetManager).
pub struct RatchetManager {
    sessions: std::collections::HashMap<String, DHRatchet>,
}

impl RatchetManager {
    pub fn new() -> Self {
        Self {
            sessions: std::collections::HashMap::new(),
        }
    }

    pub fn init_session(&mut self, session_id: &str, master_secret: &[u8; 32], remote_public: PublicKey) {
        let ratchet = DHRatchet::new(master_secret, remote_public);
        self.sessions.insert(session_id.to_string(), ratchet);
    }

    pub fn get_ratchet_mut(&mut self, session_id: &str) -> Option<&mut DHRatchet> {
        self.sessions.get_mut(session_id)
    }

    pub fn remove_session(&mut self, session_id: &str) -> Result<(), String> {
        self.sessions.remove(session_id)
            .map(|_| ())
            .ok_or_else(|| format!("Sesión no existía en memoria: {}", session_id))
    }
}
