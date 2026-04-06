use anchor_lang::prelude::*;
use crate::state::RegionAccount;
use crate::errors::ZkLocationError;

#[derive(Accounts)]
pub struct DeleteRegion<'info> {
    #[account(
        mut,
        close = authority,
        seeds = [b"region", region_pda.region_id.as_ref()],
        bump = region_pda.bump,
        constraint = region_pda.authority == authority.key()
            @ ZkLocationError::Unauthorized
    )]
    pub region_pda: Account<'info, RegionAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn handler(_ctx: Context<DeleteRegion>) -> Result<()> {
    Ok(())
}