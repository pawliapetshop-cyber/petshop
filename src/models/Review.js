module.exports = (sequelize, DataTypes) => {
  return sequelize.define("Review", {
    customerName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    customerEmail: {
      type: DataTypes.STRING,
      allowNull: false
    },
    rating: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "pending"
    },
    adminNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    hasImages: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  });
};
