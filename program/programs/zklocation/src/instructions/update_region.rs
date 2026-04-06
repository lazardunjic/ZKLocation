use anchor_lang::prelude::*;
use crate::state::RegionAccount;
use crate::errors::ZkLocationError;

#[derive(Accounts)]
pub struct UpdateRegion<'info> {
    #[account(
        mut,
        seeds = [b"region", region_pda.region_id.as_ref()],
        bump = region_pda.bump,
        constraint = region_pda.authority == authority.key()
            @ ZkLocationError::Unauthorized
    )]
    pub region_pda: Account<'info, RegionAccount>,

    pub authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<UpdateRegion>,
    name: Option<String>,
    centroid_lat: Option<i64>,
    centroid_lon: Option<i64>,
    radius_m: Option<u32>,
) -> Result<()> {
    let region = &mut ctx.accounts.region_pda;

    if let Some(n) = name {
        require!(n.len() <= 64, ZkLocationError::NameTooLong);
        region.name = n;
    }
    if let Some(lat) = centroid_lat {
        region.centroid_lat = lat;
    }
    if let Some(lon) = centroid_lon {
        region.centroid_lon = lon;
    }
    if let Some(r) = radius_m {
        require!(r >= 1 && r <= 100_000, ZkLocationError::InvalidRadius);
        region.radius_m = r;
    }
    Ok(())
}