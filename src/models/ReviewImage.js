module.exports = (sequelize, DataTypes) => {
  return sequelize.define("ReviewImage", {
    image: {
      type: DataTypes.STRING,
      allowNull: false
    }
  });
};
