module.exports = (sequelize, DataTypes) => {
  return sequelize.define("Admin", {
    email: DataTypes.STRING,
    password: DataTypes.STRING,
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "store_admin"
    }
  });
};
