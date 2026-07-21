use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

use crate::error::{AppError, AppResult};

/// Hash a plaintext password using Argon2id.
///
/// Runs on a blocking thread to avoid stalling the async runtime,
/// since Argon2 is intentionally CPU-intensive.
pub async fn hash_password(password: String) -> AppResult<String> {
    tokio::task::spawn_blocking(move || {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default(); // Argon2id with recommended params
        argon2
            .hash_password(password.as_bytes(), &salt)
            .map(|hash| hash.to_string())
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Password hashing failed: {}", e)))
    })
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("Blocking task failed: {}", e)))?
}

/// Verify a plaintext password against an Argon2id hash.
///
/// Returns `true` if the password matches, `false` otherwise.
/// Runs on a blocking thread for the same reason as `hash_password`.
pub async fn verify_password(password: String, hash: String) -> AppResult<bool> {
    tokio::task::spawn_blocking(move || {
        let parsed = PasswordHash::new(&hash)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid stored hash: {}", e)))?;
        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok())
    })
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("Blocking task failed: {}", e)))?
}
