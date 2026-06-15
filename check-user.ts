import mongoose from 'mongoose';
import User from './models/User';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const user = await User.findOne({ email: 'hebertsandinhacorretor@gmail.com' });
  console.log(JSON.stringify(user, null, 2));
  process.exit(0);
}
run();
