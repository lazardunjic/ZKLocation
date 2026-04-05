use anchor_lang::prelude::*;

#[account]
pub struct NullifierAccount {
    pub nullifier_hash: [u8; 32],
    pub region_id: [u8; 16],
    pub used_at_slot: u64,
    pub bump: u8,
}

impl NullifierAccount {
    pub const LEN: usize = 8 + 32 + 16 + 8 + 1; 
}