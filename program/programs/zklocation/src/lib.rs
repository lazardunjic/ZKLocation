use anchor_lang::prelude::*;

pub mod errors;
pub mod state;
pub mod instructions;

use state::*;
use errors::*;
use instructions::*;

declare_id!("xRkuEGnTm4EiP1JFZM3no8KqhP6REQC43RqkdzUcXWy");

#[program]
pub mod zklocation {
    use super::*;

    pub fn approve_authority(ctx: Context<ApproveAuthority>, authority: Pubkey, label: String) -> Result<()> {
        instructions::approve_authority::handler(ctx, authority, label)
    }

    pub fn revoke_authority(ctx: Context<RevokeAuthority>) -> Result<()> {
        instructions::revoke_authority::handler(ctx)
    }

    pub fn submit_region(ctx: Context<SubmitRegion>, region_id: [u8; 16], name: String, centroid_lat: i64, centroid_lon: i64, radius_m: u32) -> Result<()> {
        instructions::submit_region::handler(ctx, region_id, name, centroid_lat, centroid_lon, radius_m)
    }

    pub fn update_region(ctx: Context<UpdateRegion>, name: Option<String>, centroid_lat: Option<i64>, centroid_lon: Option<i64>, radius_m: Option<u32>) -> Result<()> {
        instructions::update_region::handler(ctx, name, centroid_lat, centroid_lon, radius_m)
    }

    pub fn delete_region(ctx: Context<DeleteRegion>) -> Result<()> {
        instructions::delete_region::handler(ctx)
    }

    pub fn register_nullifier(ctx: Context<RegisterNullifier>, nullifier_hash: [u8; 32], region_id: [u8; 16], slot: u64) -> Result<()> {
        instructions::register_nullifier::handler(ctx, nullifier_hash, region_id, slot)
    }

    pub fn verify_region_membership(ctx: Context<VerifyRegionMembership>, nullifier_hash: [u8; 32], region_id: [u8; 16]) -> Result<()> {
        instructions::verify_region_membership::handler(ctx, nullifier_hash, region_id)
    }
}
