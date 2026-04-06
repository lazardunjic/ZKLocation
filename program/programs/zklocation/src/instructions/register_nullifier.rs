use anchor_lang::prelude::*;
use crate::state::{NullifierAccount, RegionAccount};
use crate::errors::ZkLocationError;
use crate::instructions::approve_authority::PROGRAM_ADMIN;

pub const SLOT_WINDOW: u64 = 150;

#[derive(Accounts)]
#[instruction(nullifier_hash: [u8; 32])]
pub struct RegisterNullifier<'info> {
    #[account(
        init_if_needed,
        payer = backend_authority,
        space = NullifierAccount::LEN,
        seeds = [b"nullifier", nullifier_hash.as_ref()],
        bump
    )]
    pub nullifier_pda: Account<'info, NullifierAccount>,

    #[account(
        seeds = [b"region", region_pda.region_id.as_ref()],
        bump = region_pda.bump
    )]
    pub region_pda: Account<'info, RegionAccount>,

    #[account(
        mut,
        constraint = backend_authority.key().to_string() == PROGRAM_ADMIN
            @ ZkLocationError::Unauthorized
    )]
    pub backend_authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterNullifier>,
    nullifier_hash: [u8; 32],
    region_id: [u8; 16],
    slot: u64,
) -> Result<()> {
    let current_slot = Clock::get()?.slot;

    require!(
        current_slot.saturating_sub(slot) <= SLOT_WINDOW,
        ZkLocationError::SlotTooOld
    );

    require!(
        ctx.accounts.region_pda.region_id == region_id,
        ZkLocationError::RegionMismatch
    );

    let nullifier = &mut ctx.accounts.nullifier_pda;

    //ovde gledam da li acc postoji
    if nullifier.used_at_slot != 0 {
        require!(
            nullifier.nullifier_hash == nullifier_hash,
            ZkLocationError::NullifierAlreadyUsed
        );
        require!(
            nullifier.region_id == region_id,
            ZkLocationError::NullifierAlreadyUsed
        );
        return Ok(()); 
    }

    nullifier.nullifier_hash = nullifier_hash;
    nullifier.region_id = region_id;
    nullifier.used_at_slot = current_slot;
    nullifier.bump = ctx.bumps.nullifier_pda;
    Ok(())
}