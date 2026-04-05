use anchor_lang::prelude::*;

#[error_code]
pub enum ZkLocationError{
    #[msg("Name exceeds 64 bytes")]
    NameTooLong,
    #[msg("Authority label exceeds 64 bytes")]
    LabelTooLong,
    #[msg("Radius must be 1-100000 meters")]
    InvalidRadius,
    #[msg("Signer is not the region authority")]
    Unauthorized,
    #[msg("Caller is not the program admin")]
    NotProgramAdmin,
    #[msg("Whitelist entry already exists")]
    AlreadyWhitelisted,
    #[msg("Caller has no whitelist entry")]
    NotWhitelisted,
    #[msg("Nullifier has already been registered")]
    NullifierAlreadyUsed,
    #[msg("NullifierAccount not found")]
    NullifierNotFound,
    #[msg("Nullifier region_id does not match region PDA")]
    RegionMismatch,
    #[msg("RegionAccount not found")]
    RegionNotFound,
    #[msg("Proof slot is outside accepted window")]
    SlotTooOld,
}