fn abs_i64(x: i64) -> i64 {
    if x >= 0 { x } else { -x }
}

fn poseidon2_hash_3(inputs: [Field; 3]) -> Field {
    let state: [Field; 4] = [inputs[0], inputs[1], inputs[2], 0];
    let out = std::hash::poseidon2_permutation(state, 4);
    out[0]
}

fn cos_scale(lat_abs: i64) -> (i64, i64) {
    let d30: i64 = 30_000_000;
    let d50: i64 = 50_000_000;
    let d65: i64 = 65_000_000;
    if lat_abs < d30 {
        (87, 100)
    } else if lat_abs < d50 {
        (64, 100)
    } else if lat_abs < d65 {
        (42, 100)
    } else {
        (17, 100)
    }
}

fn main(
    lat:            i64,
    lon:            i64,
    user_secret:    Field,

    nullifier_hash: pub Field,
    region_id:      pub Field,
    centroid_lat:   pub i64,
    centroid_lon:   pub i64,
    radius_m:       pub u32,
    slot_field:     pub Field,
) {
    let delta_lat = abs_i64(lat - centroid_lat);
    let delta_lon = abs_i64(lon - centroid_lon);

    let dist_lat_mm = delta_lat * 111;

    let (cos_num, cos_den) = cos_scale(abs_i64(lat));
    let dist_lon_mm = (delta_lon * 111 * cos_num) / cos_den;

    let dist_sq   = dist_lat_mm * dist_lat_mm + dist_lon_mm * dist_lon_mm;
    let radius_mm = (radius_m as i64) * 1000;

    assert(dist_sq <= radius_mm * radius_mm);

    let computed = poseidon2_hash_3([user_secret, region_id, slot_field]);
    assert(computed == nullifier_hash);
}

fn make_nullifier(user_secret: Field, region_id: Field, slot_field: Field) -> Field {
    poseidon2_hash_3([user_secret, region_id, slot_field])
}

#[test]
fn test_inside_belgrade() {
    let secret: Field = 0x01;
    let rid:    Field = 0xBE09;
    let slot:   Field = 280_000_000;
    let nh = make_nullifier(secret, rid, slot);
    main(44_787_000, 20_457_000, secret, nh, rid, 44_787_000, 20_457_000, 1000, slot);
}

#[test]
fn test_on_boundary() {
    let secret: Field = 0x02;
    let rid:    Field = 0xBE09;
    let slot:   Field = 280_000_001;
    let nh = make_nullifier(secret, rid, slot);
    main(44_796_000, 20_457_000, secret, nh, rid, 44_787_000, 20_457_000, 1000, slot);
}

#[test(should_fail)]
fn test_one_microdeg_outside() {
    let secret: Field = 0x03;
    let rid:    Field = 0xBE09;
    let slot:   Field = 280_000_002;
    let nh = make_nullifier(secret, rid, slot);
    main(44_797_000, 20_457_000, secret, nh, rid, 44_787_000, 20_457_000, 1000, slot);
}

#[test]
fn test_high_latitude_65n() {
    let secret: Field = 0x04;
    let rid:    Field = 0xBE09;
    let slot:   Field = 280_000_003;
    let nh = make_nullifier(secret, rid, slot);
    main(65_000_000, 25_000_000, secret, nh, rid, 65_000_000, 25_100_000, 5000, slot);
}

#[test(should_fail)]
fn test_wrong_nullifier_hash() {
    let secret:    Field = 0x05;
    let rid:       Field = 0xBE09;
    let slot:      Field = 280_000_004;
    let fake_hash: Field = 0xDEAD;
    main(44_787_000, 20_457_000, secret, fake_hash, rid, 44_787_000, 20_457_000, 1000, slot);
}

#[test(should_fail)]
fn test_nullifier_wrong_slot() {
    let secret:     Field = 0x06;
    let rid:        Field = 0xBE09;
    let real_slot:  Field = 280_000_005;
    let stale_slot: Field = 999;
    let stale_hash = make_nullifier(secret, rid, stale_slot);
    main(44_787_000, 20_457_000, secret, stale_hash, rid, 44_787_000, 20_457_000, 1000, real_slot);
}
