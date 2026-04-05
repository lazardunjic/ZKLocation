use anchor_lang::prelude::*;

#[account]
pub struct RegionAccount{
    pub region_id: [u8; 16],
    pub name: String,
    pub centroid_lat: i64,
    pub centroid_lon: i64,
    pub radius_m: u32,
    pub authority: Pubkey,
    pub bump: u8,
}

impl RegionAccount{
    pub const LEN: usize = 8 + 16 + (4 + 64) + 8 + 8 + 4 + 32 + 1;
}