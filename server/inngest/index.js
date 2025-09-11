import { Inngest } from "inngest";
import User from "../models/User.js";
import connectDB from "../configs/db.js";
import Booking from "./../models/Bookings.js";
import Show from "./../models/Show.js";
import sendEmail from "../configs/nodeMailer.js";

await connectDB();

// Create a client to send and receive events
export const inngest = new Inngest({ id: "movie-ticket-booking" });

// Inngest Function to create user from database
const syncUserCreation = inngest.createFunction(
  { id: "sync-user-from-clerk" },
  { event: "clerk/user.created" },
  async ({ event }) => {
    try {
      const { id, first_name, last_name, email_addresses, image_url } =
        event.data;

      // const name =
      //   first_name || last_name
      //     ? `${first_name || ""} ${last_name || ""}`.trim()
      //     : email_addresses[0].email_address.split("@")[0];

      const name = first_name + " " + last_name;

      const image = image_url || "https://your-default-avatar.png";

      const userData = {
        _id: id,
        email: email_addresses[0].email_address,
        name,
        image,
      };

      await User.create(userData);
      return { status: "ok", userData };
    } catch (err) {
      console.error("Mongo create user error:", err);
      throw err; // bắt buộc throw để Inngest đánh fail thay vì treo
    }
  }
);

// Inngest Function to delete user from database
const syncUserDeletion = inngest.createFunction(
  { id: "delete-user-with-clerk" },
  { event: "clerk/user.deleted" },
  async ({ event }) => {
    const { id } = event.data;
    await User.findByIdAndDelete(id);
  }
);

// Inngest Function to update user from database
const syncUserUpdation = inngest.createFunction(
  { id: "update-user-from-clerk" },
  { event: "clerk/user.updated" },
  async ({ event }) => {
    const { id, first_name, last_name, email_addresses, image_url } =
      event.data;
    const userData = {
      _id: id,
      email: email_addresses[0].email_address,
      name: first_name + " " + last_name,
      image: image_url,
    };
    await User.findByIdAndUpdate(id, userData);
  }
);

/**Inngest Function to cancel booking and release seats of
 *  show after 10 minutes of booking create if payment it not made */
const releaseSeatsAndDeleteBooking = inngest.createFunction(
  { id: "release-seats-delete-booking" },
  { event: "app/checkpayment" },
  async ({ event, step }) => {
    const tenMinutesLater = new Date(Date.now() + 10 * 60 * 1000);
    await step.sleepUntil("wait-for-10-minutes", tenMinutesLater);

    await step.run("check-payment-status", async () => {
      const bookingId = event.data.bookingId;
      const booking = await Booking.findById(bookingId);

      // if payment is not made, release seats and delete booking
      if (!booking.isPaid) {
        const show = await Show.findById(booking.show);
        booking.bookedSeats.forEach((seat) => {
          delete show.occupiedSeats[seat];
        });
        show.markModified("occupiedSeats");
        await show.save();
        await Booking.findByIdAndDelete(booking._id);
      }
    });
  }
);

// Inngest Function to send email when user books a show
const sendBookingConfirmationEmail = inngest.createFunction(
  { id: "send-booking-confirmation-email" },
  { event: "app/show.booked" },
  async ({ event, step }) => {
    const { bookingId } = event.data;

    const booking = await Booking.findById(bookingId)
      .populate({
        path: "show",
        populate: { path: "movie", model: "Movie" },
      })
      .populate("user");

    await sendEmail({
      to: booking.user.email,
      subject: `Payment Confirmation: "${booking.show.movie.title}" booked! `,
      body: `<div style="font-family: Arial, sans-serif; line-height: 1.5;">
  <h2>Xin chào ${booking.user.name},</h2>
  <p>Vé xem phim cho <strong style="color: #F84565;">${
    booking.show.movie.title
  }</strong> của bạn đã được xác nhận.</p>
  <p>
    <strong>Ngày:</strong> ${new Date(
      booking.show.showDateTime
    ).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}<br/>
    <strong>Giờ:</strong> ${new Date(
      booking.show.showDateTime
    ).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
  </p>
  <p>Chúc bạn có những phút giây xem phim thật vui vẻ! 🍿</p>
  <p>Cảm ơn bạn đã đặt vé cùng chúng tôi!<br/>— Đội ngũ QuickShow</p>
</div>`,
    });
  }
);

// Inngest Function to send reminders
const sendShowReminders = inngest.createFunction(
  { id: "send-show-reminders" },
  { cron: "0 */8 * * *" }, // every 8 hours
  async ({ step }) => {
    const now = new Date();
    const in8Hours = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const windowStart = new Date(in8Hours.getTime() - 10 * 60 * 1000);

    // Prepare reminder tasks
    const reminderTasks = await step.run("prepare-reminder-tasks", async () => {
      const shows = await Show.find({
        showTime: { $gte: windowStart, $lte: in8Hours },
      }).populate("movie");

      const tasks = [];

      for (const show of shows) {
        if (!show.movie || !show.occupiedSeats) continue;

        const userIds = [...new Set(Object.values(show.occupiedSeats))];
        if (userIds.length === 0) continue;

        const users = await User.find({ _id: { $in: userIds } }).select(
          "name email"
        );

        for (const user of users) {
          tasks.push({
            userEmail: user.email,
            userName: user.name,
            movieTitle: show.movie.title,
            showTime: show.showTime,
          });
        }
      }
      return tasks;
    });

    if (reminderTasks.length === 0) {
      return { sent: 0, message: "No reminders to send." };
    }

    // Send reminder emails
    const results = await step.run("send-all-reminders", async () => {
      return await Promise.allSettled(
        reminderTasks.map((task) =>
          sendEmail({
            to: task.userEmail,
            subject: `Reminder: uour movie "${task.movieTitle}" starts soon `,
            body: `<div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Hello ${task.userName},</h2>
            <p>This is a quick reminder that your movie:</p>
            <h3 style="color: #F84565;">"${task.movieTitle}"</h3>
            <p>
              is scheduled for <strong>${showTime.toLocaleDateString("en-US", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}</strong> at 
              <strong>${showTime.toLocaleTimeString("en-US", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}</strong>.
            </p>
            <p>It starts in approximately <strong>${hoursLeft} hour(s)</strong> - make sure you're ready!</p>
            <br/>
            <p>Enjoy the show!<br/>QuickShow Team</p>
          </div>`,
          })
        )
      );
    });

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - sent;

    return {
      sent,
      failed,
      message: `Sent ${sent} reminder(s), ${failed} failed. `,
    };
  }
);

// Inngest Function to sent notification when a new show is added
const sendNewShowNotifications = inngest.createFunction(
  { id: "send-new-show-notifications" },
  { event: "app/show.added" },
  async ({ event }) => {
    const { movieTitle } = event.data;

    const users = await User.find({});

    for (const user of users) {
      const userEmail = user.email;
      const userName = user.name;

      const subject = `New Show Added: ${movieTitle}`;
      const body = `<div style="font-family: Arial, sans-serif; padding: 20px;">
  <h2>Hi ${userName},</h2>
  <p>We've just added a new show to our library:</p>
  <h3 style="color: #F84565;">"${movieTitle}"</h3>
  <p>Visit our website</p>
  <br/>
  <p>Thanks,<br/>QuickShow Team</p>
</div>`;

      await sendEmail({
        to: userEmail,
        subject,
        body,
      });
    }

    return { message: "Notifications sent." };
  }
);

export const functions = [
  syncUserCreation,
  syncUserDeletion,
  syncUserUpdation,
  releaseSeatsAndDeleteBooking,
  sendBookingConfirmationEmail,
  sendShowReminders,
  sendNewShowNotifications,
];
