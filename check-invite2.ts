import mongoose from 'mongoose';
import Invite from './models/Invite';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const invite = await Invite.find({ inviteeUserId: '692975d3ee9e8a497a9a4212' });
  console.log(invite);
  process.exit(0);
}
run();
