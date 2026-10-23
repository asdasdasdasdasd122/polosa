export const WORLD = { width: 600, height: 720, roadLeft: 120, laneWidth: 120, playerY: 555, carWidth: 55, carHeight: 102, trafficSpawnY: -760 };
export const laneX = lane => WORLD.roadLeft + WORLD.laneWidth * (lane + .5);

export class Drive {
  constructor(random = Math.random) { this.random = random; this.reset(); this.state = 'ready'; }
  reset() {
    this.state = 'playing'; this.lane = 1; this.x = laneX(1); this.tilt = 0;
    this.time = 0; this.distance = 0; this.scroll = 0; this.traffic = [];
    this.spawnIn = 1.35; this.passed = 0; this.crash = null;
    this.lives = 3; this.hitShield = 0; this.impact = null;
    this.coins = []; this.collected = 0; this.coinId = 0;
    this.nitro = 100; this.nitroLeft = 0;
    this.ult = 0; this.flightLeft = 0; this.altitude = 0; this.landingGrace = 0;
    this.events = [];
    for (let i = 0; i < 4; i++) this.addCoin(1, 230 - i * 68);
  }
  move(direction) {
    if (this.state !== 'playing') return false;
    const next = Math.max(0, Math.min(2, this.lane + direction));
    if (next === this.lane) return false;
    this.lane = next; return true;
  }
  boost() {
    if (this.state !== 'playing' || this.nitroLeft > 0 || this.nitro < 70) return false;
    this.nitro -= 70; this.nitroLeft = 3; this.events.push('nitro'); return true;
  }
  fly() {
    if (this.state !== 'playing' || this.ult < 100 || this.flightLeft > 0 || this.landingGrace > 0) return false;
    this.ult = 0; this.flightLeft = 6; this.events.push('flight'); return true;
  }
  get airborne() { return this.flightLeft > 0; }
  get protected() { return this.airborne || this.landingGrace > 0 || this.hitShield > 0; }
  get speed() { return (72 + Math.min(88, this.time * 1.25)) * (this.nitroLeft > 0 ? 1.65 : 1) * (this.airborne ? 1.12 : 1); }
  get worldSpeed() { return 180 + this.speed * 1.8; }
  addCoin(lane, y) { this.coins.push({ id: this.coinId++, lane, x: laneX(lane), y }); }
  spawn() {
    // Each traffic row leaves at least one lane clear. Consecutive rows are
    // spaced far enough apart to cross the entire road at maximum speed.
    const free = Math.floor(this.random() * 3);
    const lanes = [0, 1, 2].filter(l => l !== free);
    if (this.time < 12 || this.random() < .48) lanes.splice(Math.floor(this.random() * 2), 1);
    // The old 2D spawn point was already on screen under the 3D camera.
    // Start the whole vehicle above the camera frame, including its rear.
    for (const lane of lanes) this.traffic.push({ lane, x: laneX(lane), y: WORLD.trafficSpawnY, color: Math.floor(this.random() * 4), variant: this.random(), counted: false });
    for (let i = 0; i < 4; i++) this.addCoin(free, WORLD.trafficSpawnY - i * 68);
  }
  update(dt) {
    if (this.state !== 'playing') return;
    dt = Math.min(dt, .04);
    this.hitShield = Math.max(0, this.hitShield - dt);
    if (this.impact) this.impact.age += dt;
    // All ability timers share simulation time, so pausing freezes them.
    const wasFlying = this.airborne;
    this.nitroLeft = Math.max(0, this.nitroLeft - dt);
    this.flightLeft = Math.max(0, this.flightLeft - dt);
    this.landingGrace = Math.max(0, this.landingGrace - dt);
    if (wasFlying && !this.airborne) { this.landingGrace = 1.2; this.events.push('landing'); }
    this.altitude += ((this.airborne ? 90 : 0) - this.altitude) * (1 - Math.exp(-6 * dt));
    if (this.nitroLeft === 0) this.nitro = Math.min(100, this.nitro + dt * 10);
    if (!this.airborne && this.landingGrace === 0) this.ult = Math.min(100, this.ult + dt * 2.5);
    this.time += dt; this.distance += this.speed / 3.6 * dt;
    const motion = this.worldSpeed * dt;
    this.scroll = (this.scroll + motion) % 100000;
    const previousX = this.x;
    this.x += (laneX(this.lane) - this.x) * (1 - Math.exp(-17 * dt));
    this.tilt += (((this.x - previousX) * .011 / Math.max(dt * 60, .1)) - this.tilt) * Math.min(1, dt * 12);
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) { this.spawn(); this.spawnIn += Math.max(.96, 1.47 - this.time * .006); }
    for (const car of this.traffic) {
      car.y += motion;
      if (!car.counted && car.y > WORLD.playerY + 102) { car.counted = true; this.passed++; }
      // A forgiving hitbox follows the car while it changes lanes.
      if (!this.protected && Math.abs(this.x - car.x) < WORLD.carWidth - 9 && Math.abs(WORLD.playerY - car.y) < WORLD.carHeight - 15) {
        this.lives--;
        this.impact = { x: (this.x + car.x) / 2, y: (WORLD.playerY + car.y) / 2, age: 0 };
        if (this.lives === 0) {
          this.state = 'over'; this.crash = { x: this.x, y: WORLD.playerY };
          this.nitroLeft = 0; this.events.push('explode'); break;
        }
        this.hitShield = 1.8; this.events.push('hit');
      }
    }
    this.traffic = this.traffic.filter(c => c.y < WORLD.height + 150);
    if (this.state !== 'playing') return;
    for (const coin of this.coins) {
      coin.y += motion;
      if (Math.abs(this.x - coin.x) < 39 && Math.abs(WORLD.playerY - coin.y) < 36) {
        coin.taken = true; this.collected++; this.nitro = Math.min(100, this.nitro + 4);
        if (!this.airborne && this.landingGrace === 0) this.ult = Math.min(100, this.ult + 8);
        this.events.push('coin');
      }
    }
    this.coins = this.coins.filter(c => !c.taken && c.y < WORLD.height + 100);
  }
}
