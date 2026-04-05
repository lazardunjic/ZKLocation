use anchor_lang::prelude::*;

#[account]
pub struct WhitelistEntry {
    pub authority: Pubkey,
    pub label: String,
    pub approved_at_slot: u64,
    pub bump: u8,
}

impl WhitelistEntry {
    pub const LEN: usize = 8 + 32 + (4 + 64) + 8 + 1; 
}