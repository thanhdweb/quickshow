import Booking from "./../models/Bookings.js";
import { clerkClient } from "@clerk/express";
import Movie from "./../models/Movie.js";

// API Controller Function to get user Bookings
export const getUserBookings = async (req, res) => {
  try {
    const user = req.auth().userId;

    const bookings = await Booking.find({ user })
      .populate({
        path: "show",
        populate: { path: "movie" },
      })
      .sort({ createdAt: -1 });
    res.json({ success: true, bookings });
  } catch (error) {
    console.error(error.message);
    res.json({ success: false, message: error.message });
  }
};

// API Controller Function to Add Favorite Movie in clerk metadata
export const updateFavorite = async (req, res) => {
  try {
    const { movieId } = req.body;
    const userId = req.auth().userId;

    const user = await clerkClient.users.getUser(userId);

    if (!user.privateMetadata.favorites) {
      user.privateMetadata.favorites = [];
    }

    let message = "";

    if (!user.privateMetadata.favorites.includes(movieId)) {
      user.privateMetadata.favorites.push(movieId);
      message = "Added to favorites.";
    } else {
      user.privateMetadata.favorites = user.privateMetadata.favorites.filter(
        (item) => item !== movieId
      );
      message = "Removed from favorites.";
    }

    await clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: user.privateMetadata,
    });

    res.json({ success: true, message });
  } catch (error) {
    console.error(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const getFavorites = async (req, res) => {
  try {
    const user = await clerkClient.users.getUser(req.auth().userId);
    const favorites = user.privateMetadata.favorites;

    //getting movies from database
    const movies = await Movie.find({ _id: { $in: favorites } });

    res.json({ success: true, movies });
  } catch (error) {
    console.error(error.message);
    res.json({ success: false, message: error.message });
  }
};
