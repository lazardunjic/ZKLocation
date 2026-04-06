use anchor_lang::prelude::*;
use crate::state::{RegionAccount, WhitelistEntry};
use crate::errors::ZkLocationError;

#[derive(Accounts)]
#[instruction(region_id: [u8; 16])]
pub struct SubmitRegion<'info> {
    #[account(
        init,
        payer = authority,
        space = RegionAccount::LEN,
        seeds = [b"region", region_id.as_ref()],
        bump
    )]
    pub region_pda: Account<'info, RegionAccount>,

    #[account(
        seeds = [b"whitelist", authority.key().as_ref()],
        bump = whitelist_entry.bump
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SubmitRegion>,
    region_id: [u8; 16],
    name: String,
    centroid_lat: i64,
    centroid_lon: i64,
    radius_m: u32,
) -> Result<()> {
    require!(name.len() <= 64, ZkLocationError::NameTooLong);
    require!(radius_m >= 1 && radius_m <= 100_000, ZkLocationError::InvalidRadius);

    let region = &mut ctx.accounts.region_pda;
    region.region_id = region_id;
    region.name = name;
    region.centroid_lat = centroid_lat;
    region.centroid_lon = centroid_lon;
    region.radius_m = radius_m;
    region.authority = ctx.accounts.authority.key();
    region.bump = ctx.bumps.region_pda;
    Ok(())
}