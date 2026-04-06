use anchor_lang::prelude::*;
use crate::state::WhitelistEntry;
use crate::errors::ZkLocationError;
use crate::instructions::approve_authority::PROGRAM_ADMIN;

#[derive(Accounts)]
pub struct RevokeAuthority<'info> {
    #[account(
        mut,
        close = program_admin,
        seeds = [b"whitelist", whitelist_entry.authority.as_ref()],
        bump = whitelist_entry.bump
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

pub fn handler(_ctx: Context<RevokeAuthority>) -> Result<()> {
    Ok(())
}