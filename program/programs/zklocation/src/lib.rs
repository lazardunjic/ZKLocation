use anchor_lang::prelude::*;

declare_id!("xRkuEGnTm4EiP1JFZM3no8KqhP6REQC43RqkdzUcXWy");

#[program]
pub mod zklocation {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
