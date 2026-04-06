use anchor_lang::prelude::*;
use crate::state::WhitelistEntry;
use crate::errors::ZkLocationError;

pub const PROGRAM_ADMIN: &str = "GKQrocZCZDVhE1iSmJSQwtNbkpe1cxHVSjDQyFCvayuY";

#[derive(Accounts)]
#[instruction(authority: Pubkey)]
pub struct ApproveAuthority<'info> {
    #[account(
        init,
        payer = program_admin,
        space = WhitelistEntry::LEN,
        seeds = [b"whitelist", authority.as_ref()],
        bump
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,

    #[account(
        mut,
        constraint = program_admin.key().to_string() == PROGRAM_ADMIN
            @ ZkLocationError::NotProgramAdmin
    )]
    pub program_admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ApproveAuthority>,
    authority: Pubkey,
    label: String,
) -> Result<()> {
    require!(label.len() <= 64, ZkLocationError::LabelTooLong);

    let entry = &mut ctx.accounts.whitelist_entry;
    entry.authority = authority;
    entry.label = label;
    entry.approved_at_slot = Clock::get()?.slot;
    entry.bump = ctx.bumps.whitelist_entry;
    Ok(())
}