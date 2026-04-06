use anchor_lang::prelude::*;
use crate::state::{NullifierAccount, RegionAccount};
use crate::errors::ZkLocationError;

#[derive(Accounts)]
#[instruction(nullifier_hash: [u8; 32])]
pub struct VerifyRegionMembership<'info> {
    #[account(
        seeds = [b"nullifier", nullifier_hash.as_ref()],
        bump = nullifier_pda.bump
    )]
    pub nullifier_pda: Account<'info, NullifierAccount>,

    #[account(
        seeds = [b"region", region_pda.region_id.as_ref()],
        bump = region_pda.bump
    )]
    pub region_pda: Account<'info, RegionAccount>,
}

pub fn handler(
    ctx: Context<VerifyRegionMembership>,
    _nullifier_hash: [u8; 32],
    region_id: [u8; 16],
) -> Result<()> {
    require!(
        ctx.accounts.nullifier_pda.region_id == region_id,
        ZkLocationError::RegionMismatch
    );
    Ok(())
}