import mongoose from "mongoose";

const interactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null,
    },
    type: {
      type: String,
      enum: ["like", "comment", "follow"],
      required: true,
    },
    weight: {
      type: Number,
      default: 1,
      min: 0,
    },
    lastInteractionAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

interactionSchema.index(
  { user: 1, targetUser: 1, targetPost: 1, type: 1 },
  { unique: true, sparse: true }
);

interactionSchema.index({ user: 1, targetUser: 1, lastInteractionAt: -1 });

const Interaction = mongoose.model("Interaction", interactionSchema);
export default Interaction;

