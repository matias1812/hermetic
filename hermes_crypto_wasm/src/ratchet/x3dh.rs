use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use hkdf::Hkdf;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::{Zeroize, ZeroizeOnDrop};
// Intentar usar kem traits si están re-exportados o en prelude, sino asumiremos métodos concretos

/// Paquete de pre-claves publicado por Bob en el servidor (PreKeyBundle)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreKeyBundle {
    pub identity_key: [u8; 32],
    pub signing_key: [u8; 32],
    pub signed_pre_key: [u8; 32],
    pub signed_pre_key_signature: Vec<u8>,
    pub one_time_pre_key: Option<[u8; 32]>,
    pub one_time_pre_key_id: Option<String>,
    pub pqc_public_key: Vec<u8>,   // ML-KEM-768 Public Key (1184 bytes)
    pub mldsa_public_key: Vec<u8>, // ML-DSA-44 PK
    pub mldsa_signature: Vec<u8>,  // ML-DSA Signature over SPK
}

/// Saludo inicial enviado por Alice en el primer mensaje (InitialHandshake)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitialHandshake {
    pub sender_ephemeral_key: [u8; 32],
    pub sender_identity_key: [u8; 32],
    pub one_time_pre_key_id: Option<String>,
    pub pqc_ciphertext: Vec<u8>, // ML-KEM-768 Ciphertext (1088 bytes)
}

/// Contenedor seguro autolimpiable para secretos intermedios DH
#[derive(Zeroize, ZeroizeOnDrop)]
struct DhParts {
    dh1: [u8; 32],
    dh2: [u8; 32],
    dh3: [u8; 32],
    dh4: Option<[u8; 32]>,
}

/// Generar y firmar un nuevo PreKeyBundle (para Bob)
pub fn generate_prekey_bundle(
    ik_secret_bytes: &[u8; 32],
    signing_secret_bytes: &[u8; 32],
    mldsa_secret_seed: &[u8; 32], // Nuevo: Semilla para ML-DSA
    opk_id: Option<String>,
    pqc_pk_bytes: &[u8], // Clave pública PQC de Bob
) -> (PreKeyBundle, [u8; 32], Option<[u8; 32]>) {
    let ik_secret = StaticSecret::from(*ik_secret_bytes);
    let ik_pub = PublicKey::from(&ik_secret);

    // Firma Clásica (Ed25519)
    let signing_key = SigningKey::from_bytes(signing_secret_bytes);
    let verifying_key = signing_key.verifying_key();

    // Generar Signed PreKey (SPK)
    let spk_secret = StaticSecret::random_from_rng(OsRng);
    let spk_pub = PublicKey::from(&spk_secret);

    // Firma Clásica sobre SPK
    let signature = signing_key.sign(spk_pub.as_bytes());

    // Firma Post-Cuántica (ML-DSA-44)
    // Convertimos el seed de 32 bytes al tipo `Seed` que ml_dsa espera (típicamente [u8; 32])
    let mldsa_signing_key =
        ml_dsa::SigningKey::<ml_dsa::MlDsa44>::from_seed(mldsa_secret_seed.into());
    use ml_dsa::Keypair;
    let mldsa_pub_key = mldsa_signing_key.verifying_key();
    use ml_dsa::signature::Signer;
    let mldsa_sig = mldsa_signing_key.sign(spk_pub.as_bytes());

    // Generar One-Time PreKey (OPK) opcional
    let (opk_pub_bytes, opk_secret_bytes) = if opk_id.is_some() {
        let s = StaticSecret::random_from_rng(OsRng);
        let p = PublicKey::from(&s);
        (Some(p.to_bytes()), Some(s.to_bytes()))
    } else {
        (None, None)
    };

    use ml_dsa::SignatureEncoding;
    let bundle = PreKeyBundle {
        identity_key: ik_pub.to_bytes(),
        signing_key: verifying_key.to_bytes(),
        signed_pre_key: spk_pub.to_bytes(),
        signed_pre_key_signature: signature.to_vec(),
        one_time_pre_key: opk_pub_bytes,
        one_time_pre_key_id: opk_id,
        pqc_public_key: pqc_pk_bytes.to_vec(),
        mldsa_public_key: mldsa_pub_key.encode().to_vec(),
        mldsa_signature: mldsa_sig.to_bytes().to_vec(),
    };

    (bundle, spk_secret.to_bytes(), opk_secret_bytes)
}

/// Lado emisor (Alice): Ejecuta X3DH y retorna (SharedSecret, InitialHandshake)
pub fn initiator_x3dh(
    sender_ik_secret_bytes: &[u8; 32],
    bundle: &PreKeyBundle,
    pqc_ciphertext_out: &[u8],
    pqc_shared_secret_out: &[u8],
) -> Result<([u8; 32], InitialHandshake), String> {
    // 1A. Verificar firma Ed25519 sobre SPK
    let verifying_key = VerifyingKey::from_bytes(&bundle.signing_key)
        .map_err(|e| format!("Clave de firma Ed25519 inválida: {}", e))?;
    let sig_arr = Signature::from_slice(&bundle.signed_pre_key_signature)
        .map_err(|e| format!("Formato de firma SPK inválido: {}", e))?;

    verifying_key
        .verify_strict(&bundle.signed_pre_key, &sig_arr)
        .map_err(|_| {
            "FATAL: Verificación de firma Ed25519 fallida. Posible ataque MitM.".to_string()
        })?;

    // 1B. Verificar firma ML-DSA-44 sobre SPK (Protección Post-Cuántica de Identidad)
    let vk_bytes = bundle
        .mldsa_public_key
        .as_slice()
        .try_into()
        .map_err(|_| "Longitud PK ML-DSA inválida")?;
    let mldsa_vk = ml_dsa::VerifyingKey::<ml_dsa::MlDsa44>::decode(&vk_bytes);

    let sig_bytes = bundle
        .mldsa_signature
        .as_slice()
        .try_into()
        .map_err(|_| "Longitud Firma ML-DSA inválida")?;
    let mldsa_sig = ml_dsa::Signature::<ml_dsa::MlDsa44>::decode(&sig_bytes)
        .ok_or("Firma ML-DSA malformada".to_string())?;

    use ml_dsa::signature::Verifier;
    mldsa_vk
        .verify(&bundle.signed_pre_key, &mldsa_sig)
        .map_err(|_| {
            "FATAL: Verificación de firma PQC (ML-DSA) fallida. Identidad comprometida.".to_string()
        })?;

    // 2. Claves de Alice
    let ik_a_secret = StaticSecret::from(*sender_ik_secret_bytes);
    let ik_a_pub = PublicKey::from(&ik_a_secret);

    let ek_a_secret = StaticSecret::random_from_rng(OsRng);
    let ek_a_pub = PublicKey::from(&ek_a_secret);

    // Claves remotas de Bob
    let ik_b_pub = PublicKey::from(bundle.identity_key);
    let spk_b_pub = PublicKey::from(bundle.signed_pre_key);

    // 3. Calcular DH1..DH4 en contenedor autolimpiable
    let mut parts = DhParts {
        dh1: ik_a_secret.diffie_hellman(&spk_b_pub).to_bytes(),
        dh2: ek_a_secret.diffie_hellman(&ik_b_pub).to_bytes(),
        dh3: ek_a_secret.diffie_hellman(&spk_b_pub).to_bytes(),
        dh4: bundle.one_time_pre_key.map(|opk_bytes| {
            let opk_pub = PublicKey::from(opk_bytes);
            ek_a_secret.diffie_hellman(&opk_pub).to_bytes()
        }),
    };

    // 4. Derivar SK (X25519)
    let mut sk_x25519 = derive_x3dh_secret(&parts)?;

    // Zeroización explícita adicional
    parts.zeroize();

    // HÍBRIDO: Combinar X25519 y ML-KEM con HKDF
    let mut hybrid_ikm = Vec::with_capacity(32 + pqc_shared_secret_out.len());
    hybrid_ikm.extend_from_slice(&sk_x25519);
    hybrid_ikm.extend_from_slice(pqc_shared_secret_out);

    sk_x25519.zeroize();

    let hkdf = Hkdf::<Sha256>::new(Some(b"HermesHybrid_v1"), &hybrid_ikm);
    let mut sk = [0u8; 32];
    hkdf.expand(b"Hybrid_SharedSecret", &mut sk)
        .map_err(|e| format!("HKDF hybrid expansion error: {:?}", e))?;

    hybrid_ikm.zeroize();

    let handshake = InitialHandshake {
        sender_ephemeral_key: ek_a_pub.to_bytes(),
        sender_identity_key: ik_a_pub.to_bytes(),
        one_time_pre_key_id: bundle.one_time_pre_key_id.clone(),
        pqc_ciphertext: pqc_ciphertext_out.to_vec(),
    };

    Ok((sk, handshake))
}

/// Lado receptor (Bob): Deriva el SharedSecret usando sus claves privadas locales
pub fn responder_x3dh(
    recipient_ik_secret_bytes: &[u8; 32],
    recipient_spk_secret_bytes: &[u8; 32],
    recipient_opk_secret_bytes: Option<&[u8; 32]>,
    handshake: &InitialHandshake,
    // Secretos híbridos (calculados externamente para evitar problemas de trait import en esta capa)
    pqc_shared_secret_bytes: &[u8],
) -> Result<[u8; 32], String> {
    let ik_b_secret = StaticSecret::from(*recipient_ik_secret_bytes);
    let spk_b_secret = StaticSecret::from(*recipient_spk_secret_bytes);

    let ik_a_pub = PublicKey::from(handshake.sender_identity_key);
    let ek_a_pub = PublicKey::from(handshake.sender_ephemeral_key);

    let mut parts = DhParts {
        dh1: spk_b_secret.diffie_hellman(&ik_a_pub).to_bytes(),
        dh2: ik_b_secret.diffie_hellman(&ek_a_pub).to_bytes(),
        dh3: spk_b_secret.diffie_hellman(&ek_a_pub).to_bytes(),
        dh4: match (recipient_opk_secret_bytes, &handshake.one_time_pre_key_id) {
            (Some(opk_sec), Some(_)) => {
                let opk_secret = StaticSecret::from(*opk_sec);
                Some(opk_secret.diffie_hellman(&ek_a_pub).to_bytes())
            }
            _ => None,
        },
    };

    let mut sk_x25519 = derive_x3dh_secret(&parts)?;
    parts.zeroize();

    // HÍBRIDO: Combinar X25519 y ML-KEM con HKDF
    let mut hybrid_ikm = Vec::with_capacity(32 + pqc_shared_secret_bytes.len());
    hybrid_ikm.extend_from_slice(&sk_x25519);
    hybrid_ikm.extend_from_slice(pqc_shared_secret_bytes);

    sk_x25519.zeroize();

    let hkdf = Hkdf::<Sha256>::new(Some(b"HermesHybrid_v1"), &hybrid_ikm);
    let mut sk = [0u8; 32];
    hkdf.expand(b"Hybrid_SharedSecret", &mut sk)
        .map_err(|e| format!("HKDF hybrid expansion error: {:?}", e))?;

    hybrid_ikm.zeroize();

    Ok(sk)
}

/// Función interna HKDF-SHA256 con padding de dominio
fn derive_x3dh_secret(parts: &DhParts) -> Result<[u8; 32], String> {
    let f_pad = [0xFFu8; 32];
    let mut ikm = Vec::with_capacity(32 * 5);
    ikm.extend_from_slice(&f_pad);
    ikm.extend_from_slice(&parts.dh1);
    ikm.extend_from_slice(&parts.dh2);
    ikm.extend_from_slice(&parts.dh3);
    if let Some(ref dh4) = parts.dh4 {
        ikm.extend_from_slice(dh4);
    }

    let hkdf = Hkdf::<Sha256>::new(Some(b"HermesX3DH_v1"), &ikm);
    let mut sk = [0u8; 32];
    hkdf.expand(b"X3DH_SharedSecret", &mut sk)
        .map_err(|e| format!("HKDF expansion error: {:?}", e))?;

    let mut ikm_zeroize = ikm;
    ikm_zeroize.zeroize();

    Ok(sk)
}
